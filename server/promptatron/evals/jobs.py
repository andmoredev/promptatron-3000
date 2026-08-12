"""The in-process job registry behind ``/evaluations``: event log + fan-out.

An evaluation is accepted with ``202`` and finished by an ``asyncio`` task, so
progress has to be observable *after the fact* as well as live. Each job
therefore owns:

``log``
    Every event it has emitted, in order, as plain dicts. This is the record a
    late subscriber replays -- including a subscriber that arrives after the job
    has finished, which replays the whole log and then hits EOF.
``_subscribers``
    One :class:`asyncio.Queue` per connected client. ``emit`` appends to the log
    and fans the same dict out to every queue; ``close`` pushes the ``None``
    sentinel that ends each stream.

:meth:`EvalJob.subscribe` snapshots the log and registers the queue in a single
synchronous step, with no ``await`` in between, so the loop cannot interleave an
``emit`` -- a subscriber can therefore never miss an event nor see one twice.

Jobs stay in the registry after they finish (that is what makes late replay
work) and are pruned oldest-finished-first once :data:`MAX_RETAINED_JOBS` is
exceeded; the evaluation row in the store is always the durable record.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from promptatron.evals.events import EvalEvent

logger = logging.getLogger(__name__)

MAX_RETAINED_JOBS = 200

EventDict = dict[str, Any]


class EvalJob:
    """One running (or finished) evaluation: its event log and subscribers."""

    def __init__(self, evaluation_id: str) -> None:
        self.evaluation_id = evaluation_id
        self.log: list[EventDict] = []
        self.finished = False
        self.cancelled = False
        self.task: asyncio.Task[None] | None = None
        self._subscribers: set[asyncio.Queue[EventDict | None]] = set()

    # -- producer side -------------------------------------------------- #

    def emit(self, event: EvalEvent) -> EventDict:
        """Append an event to the log and fan it out to every subscriber."""
        entry = event.as_log_entry()
        self.log.append(entry)
        for queue in self._subscribers:
            queue.put_nowait(entry)
        return entry

    def close(self) -> None:
        """Mark the job finished and end every subscriber's stream."""
        self.finished = True
        for queue in self._subscribers:
            queue.put_nowait(None)
        self._subscribers.clear()

    # -- consumer side -------------------------------------------------- #

    def subscribe(self) -> tuple[list[EventDict], asyncio.Queue[EventDict | None] | None]:
        """``(replay, queue)``. ``queue`` is ``None`` when the job is finished."""
        replay = list(self.log)
        if self.finished:
            return replay, None
        queue: asyncio.Queue[EventDict | None] = asyncio.Queue()
        self._subscribers.add(queue)
        return replay, queue

    def unsubscribe(self, queue: asyncio.Queue[EventDict | None]) -> None:
        self._subscribers.discard(queue)

    async def follow(self) -> AsyncIterator[str]:
        """Replay this job's log as NDJSON lines, then follow it live until EOF."""
        replay, queue = self.subscribe()
        for entry in replay:
            yield to_json_line(entry)
        if queue is None:
            return
        try:
            while True:
                entry = await queue.get()
                if entry is None:
                    return
                yield to_json_line(entry)
        finally:
            self.unsubscribe(queue)


def to_json_line(entry: EventDict) -> str:
    """One NDJSON line (trailing newline included)."""
    return json.dumps(entry, default=str) + "\n"


# --------------------------------------------------------------------------- #
# Module-level registry
# --------------------------------------------------------------------------- #

_jobs: dict[str, EvalJob] = {}


def register(evaluation_id: str) -> EvalJob:
    """Create, register and return the job for ``evaluation_id``."""
    _prune()
    job = EvalJob(evaluation_id)
    _jobs[evaluation_id] = job
    return job


def get(evaluation_id: str) -> EvalJob | None:
    return _jobs.get(evaluation_id)


def clear() -> None:
    """Drop every registered job (test/teardown affordance)."""
    _jobs.clear()


def _prune() -> None:
    """Evict finished jobs, oldest first, once the registry grows too large."""
    while len(_jobs) >= MAX_RETAINED_JOBS:
        for evaluation_id, job in _jobs.items():
            if job.finished:
                del _jobs[evaluation_id]
                break
        else:  # nothing finished to evict; let the registry grow rather than lie
            return


async def cancel(job: EvalJob) -> None:
    """Cancel a running job and wait for it to persist its cancelled state.

    The job body does its own cleanup in ``except CancelledError`` (persist the
    row, emit ``eval_complete``, close the log), so waiting here is what lets the
    ``DELETE`` respond only once the store actually reflects the cancellation.
    """
    job.cancelled = True
    if job.task is None or job.task.done():
        return
    job.task.cancel()
    await asyncio.wait({job.task}, timeout=30)
