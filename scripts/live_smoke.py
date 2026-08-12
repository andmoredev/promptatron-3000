#!/usr/bin/env python3
"""Gated, real-AWS smoke test for the Promptatron server.

Exercises health, the model catalog, a streamed run, a determinism
evaluation, and guardrail CRUD against a *live* server -- i.e. one started
without ``PROMPTATRON_FAKE_MODEL``, with real AWS credentials in its
environment, that will make real (cheap, small) Amazon Bedrock calls and
therefore cost real money.

Refuses to run unless ``RUN_LIVE_BEDROCK=1`` is set, so it can never fire by
accident in CI or a routine local ``make`` run.

Usage::

    RUN_LIVE_BEDROCK=1 uv run --project server python ../scripts/live_smoke.py

    # or, from the server's own venv:
    RUN_LIVE_BEDROCK=1 python scripts/live_smoke.py

Environment
-----------
RUN_LIVE_BEDROCK    Required, must be "1". The whole point of this script.
PROMPTATRON_URL     Base URL of the running server. Default http://localhost:8000.
LIVE_SMOKE_MODEL     Model id for the run + determinism steps.
                      Default "amazon.nova-lite-v1:0" (cheap, fast, streams).
LIVE_SMOKE_GRADER     Judge model id for the determinism step.
                      Default "amazon.nova-lite-v1:0".

Exit code is 0 only if every step PASSes; 1 if any step FAILs, the guard
refuses to run, or the script cannot reach the server at all.
"""

from __future__ import annotations

import contextlib
import json
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

DEFAULT_MODEL_ID = "amazon.nova-lite-v1:0"
DEFAULT_GRADER_MODEL_ID = "amazon.nova-lite-v1:0"

DETERMINISM_POLL_INTERVAL_S = 2.0
DETERMINISM_TIMEOUT_S = 120.0

# Bedrock's per-1K-token list prices for Nova Lite, used only to print a very
# rough order-of-magnitude cost estimate -- not an invoice.
_NOVA_LITE_INPUT_PER_1K = 0.00006
_NOVA_LITE_OUTPUT_PER_1K = 0.00024


@dataclass
class SmokeState:
    """Accumulates results and running token totals across steps."""

    base_url: str
    model_id: str
    grader_model_id: str
    passed: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0


def _fail_fast(message: str) -> None:
    print(f"REFUSED: {message}", file=sys.stderr)
    sys.exit(1)


@contextlib.contextmanager
def step(state: SmokeState, name: str):
    """Prints ``PASS``/``FAIL`` + elapsed time for one numbered step.

    A step that raises is caught here (recorded as FAIL, message printed) so
    the script keeps going and every step gets a chance to report -- the
    final exit code is nonzero if any step failed, regardless.
    """
    print(f"--- {name} ---")
    started = time.monotonic()
    try:
        yield
    except Exception as exc:  # noqa: BLE001 - deliberately broad: this *is* the reporter
        elapsed_ms = (time.monotonic() - started) * 1000
        print(f"FAIL  {name}  ({elapsed_ms:.0f} ms)\n      {type(exc).__name__}: {exc}")
        state.failed.append(name)
    else:
        elapsed_ms = (time.monotonic() - started) * 1000
        print(f"PASS  {name}  ({elapsed_ms:.0f} ms)")
        state.passed.append(name)


def check_guard() -> None:
    """Refuse to run unless explicitly opted in -- before touching the network."""
    if os.environ.get("RUN_LIVE_BEDROCK") != "1":
        _fail_fast(
            "RUN_LIVE_BEDROCK=1 is required to run this script (it makes real, "
            "billed AWS Bedrock calls). Set it explicitly to proceed."
        )


def step_health(state: SmokeState, client: httpx.Client) -> None:
    response = client.get("/api/v1/health")
    response.raise_for_status()
    body = response.json()
    if body.get("status") != "ok":
        raise AssertionError(f"unexpected health payload: {body!r}")

    creds = body.get("aws", {}).get("credentials")
    print(f"      aws.credentials={creds!r} (this script cannot detect fake-model mode remotely;")
    print("      make sure the server was started WITHOUT PROMPTATRON_FAKE_MODEL=1)")


def step_models(state: SmokeState, client: httpx.Client) -> None:
    response = client.get("/api/v1/models")
    response.raise_for_status()
    body = response.json()
    models = body.get("models", [])
    if not models:
        raise AssertionError("GET /api/v1/models returned an empty catalog")
    print(f"      {len(models)} model(s), cached={body.get('cached')}")


def step_run_stream(state: SmokeState, client: httpx.Client) -> None:
    payload = {
        "model_id": state.model_id,
        "user_prompt": "Reply with a single short sentence about the weather.",
        "stream": True,
        "inference": {"max_tokens": 50},
    }

    seen_types: set[str] = set()
    text_deltas: list[str] = []
    usage: dict[str, Any] | None = None
    run_status: str | None = None

    with client.stream("POST", "/api/v1/runs", json=payload) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line.strip():
                continue
            event = json.loads(line)
            event_type = event.get("type")
            seen_types.add(event_type)

            if event_type == "text_delta":
                text_deltas.append(event["text"])
            elif event_type == "metrics":
                usage = event
            elif event_type == "run_complete":
                run_status = event.get("status")
            elif event_type == "error":
                raise AssertionError(f"run stream reported an error event: {event!r}")

    for required in ("run_start", "text_delta", "run_complete"):
        if required not in seen_types:
            raise AssertionError(f"stream never emitted a {required!r} event (saw {seen_types})")

    if run_status != "completed":
        raise AssertionError(f"run did not complete: status={run_status!r}")

    print(f"      output: {''.join(text_deltas)!r}")
    if usage is not None:
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        state.input_tokens += input_tokens
        state.output_tokens += output_tokens
        print(
            f"      tokens: input={input_tokens} output={output_tokens} "
            f"total={usage.get('total_tokens', input_tokens + output_tokens)} "
            f"latency={usage.get('latency_ms')}ms"
        )
    else:
        print("      (no metrics event arrived -- token usage unknown)")


def step_determinism(state: SmokeState, client: httpx.Client) -> None:
    payload = {
        "kind": "determinism",
        "run_config": {
            "model_id": state.model_id,
            "user_prompt": "Reply with a single short sentence about the weather.",
            "inference": {"max_tokens": 50},
        },
        "n": 2,
        "grader": {"model_id": state.grader_model_id},
    }

    response = client.post("/api/v1/evaluations", json=payload)
    response.raise_for_status()
    evaluation_id = response.json()["id"]
    print(f"      evaluation id: {evaluation_id}")

    deadline = time.monotonic() + DETERMINISM_TIMEOUT_S
    detail: dict[str, Any] = {}
    while time.monotonic() < deadline:
        poll = client.get(f"/api/v1/evaluations/{evaluation_id}")
        poll.raise_for_status()
        detail = poll.json()
        status = detail.get("status")
        if status in ("completed", "error", "cancelled"):
            break
        time.sleep(DETERMINISM_POLL_INTERVAL_S)
    else:
        raise AssertionError(f"evaluation did not finish within {DETERMINISM_TIMEOUT_S:.0f}s")

    if detail.get("status") != "completed":
        raise AssertionError(f"evaluation ended as {detail.get('status')!r}: {detail!r}")

    result = detail.get("result") or {}
    grade = result.get("grade")
    score = result.get("score")
    print(f"      grade={grade!r} score={score!r}")

    metrics = result.get("metrics", {})
    judge_input = metrics.get("judge_input_tokens")
    judge_output = metrics.get("judge_output_tokens")
    if isinstance(judge_input, int):
        state.input_tokens += judge_input
    if isinstance(judge_output, int):
        state.output_tokens += judge_output

    # n=2 determinism runs went through the engine same as step_run_stream's
    # single run; account for them at the same (small) per-run token estimate
    # since the evaluation endpoint doesn't echo per-run usage back to us.
    state.input_tokens += 2 * 20
    state.output_tokens += 2 * 20


def step_guardrail_crud(state: SmokeState, client: httpx.Client) -> None:
    name = f"live-smoke-{int(time.time())}"
    payload = {
        "name": name,
        "content_policy": {"filters": [{"type": "HATE"}]},
    }

    created = client.post("/api/v1/guardrails", json=payload)
    created.raise_for_status()
    guardrail_id = created.json()["id"]
    print(f"      created guardrail {guardrail_id} ({name})")

    try:
        fetched = client.get(f"/api/v1/guardrails/{guardrail_id}")
        fetched.raise_for_status()
        detail = fetched.json()
        if detail.get("name") != name:
            raise AssertionError(f"fetched guardrail name mismatch: {detail!r}")
        print(f"      fetched OK (status={detail.get('status')})")
    finally:
        deleted = client.delete(f"/api/v1/guardrails/{guardrail_id}")
        if deleted.status_code not in (204, 404):
            deleted.raise_for_status()
        print(f"      deleted guardrail {guardrail_id}")


def print_cost_estimate(state: SmokeState) -> None:
    estimated_cost = (
        state.input_tokens / 1000 * _NOVA_LITE_INPUT_PER_1K
        + state.output_tokens / 1000 * _NOVA_LITE_OUTPUT_PER_1K
    )
    print("--- estimated cost (rough, Nova Lite list price) ---")
    print(
        f"      ~{state.input_tokens} input tokens, ~{state.output_tokens} output tokens "
        f"=> ~${estimated_cost:.5f} USD. Actual model/pricing may differ; this is a rough "
        "order-of-magnitude note, not an invoice."
    )


def main() -> int:
    check_guard()

    base_url = os.environ.get("PROMPTATRON_URL", "http://localhost:8000")
    model_id = os.environ.get("LIVE_SMOKE_MODEL", DEFAULT_MODEL_ID)
    grader_model_id = os.environ.get("LIVE_SMOKE_GRADER", DEFAULT_GRADER_MODEL_ID)

    print(f"Live Bedrock smoke test against {base_url}")
    print(f"  model={model_id!r} grader={grader_model_id!r}\n")

    state = SmokeState(base_url=base_url, model_id=model_id, grader_model_id=grader_model_id)

    with httpx.Client(base_url=base_url, timeout=30.0) as client:
        with step(state, "1. health"):
            step_health(state, client)

        with step(state, "2. models"):
            step_models(state, client)

        with step(state, "3. run (stream)"):
            step_run_stream(state, client)

        with step(state, "4. determinism evaluation"):
            step_determinism(state, client)

        with step(state, "5. guardrail create/get/delete"):
            step_guardrail_crud(state, client)

    print()
    print_cost_estimate(state)

    print()
    print(f"{len(state.passed)} passed, {len(state.failed)} failed")
    if state.failed:
        print(f"FAILED: {', '.join(state.failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
