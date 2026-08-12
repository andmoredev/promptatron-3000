"""Deterministic, LLM-free metrics over a batch of run outcomes.

These are computed from the stored run rows alone and are part of an
evaluation's ``result`` **whether or not the judge succeeds** -- a judge failure
degrades an evaluation to "local metrics + ``judge_error``", it never fails it.

Tool consistency
----------------
``strands_evals``' tool evaluators (``ToolSelectionAccuracyEvaluator``,
``ToolParameterAccuracyEvaluator``) score a trajectory against an *expected*
trajectory supplied by the case author, and the trace-level ones want an OTel
``Session`` object -- neither maps onto "N repetitions of the same prompt, no
ground truth". So tool-call determinism is computed here instead, as the
fraction of runs whose whole tool-call signature sequence equals the modal
(most common) sequence of the batch. The signature of a call is its name plus
its canonically-serialized input, so a repeat that calls the right tool with
different arguments counts as a divergence.

A ``TrajectoryEvaluator`` still grades tool use qualitatively against the modal
sequence (see :mod:`promptatron.evals.grader`); this metric is the objective
counterpart to that judgement.
"""

from __future__ import annotations

import json
import statistics
from collections import Counter
from collections.abc import Sequence
from typing import Any

ToolSignature = tuple[str, ...]


def tool_signature(transcript: Any) -> ToolSignature:
    """The ordered ``name(canonical-json-input)`` signature of a tool transcript."""
    if not isinstance(transcript, list):
        return ()
    signature: list[str] = []
    for call in transcript:
        if not isinstance(call, dict):
            continue
        name = str(call.get("name", ""))
        try:
            payload = json.dumps(call.get("input") or {}, sort_keys=True, default=str)
        except (TypeError, ValueError):  # pragma: no cover - defensive
            payload = str(call.get("input"))
        signature.append(f"{name}({payload})")
    return tuple(signature)


def modal_value[T](values: Sequence[T]) -> T | None:
    """The most common value, ties broken by first appearance. ``None`` if empty."""
    if not values:
        return None
    counts = Counter(values)
    best = max(counts.values())
    for value in values:
        if counts[value] == best:
            return value
    return None  # pragma: no cover - unreachable


def local_metrics(outputs: Sequence[str], transcripts: Sequence[Any]) -> dict[str, Any]:
    """Compute the LLM-free determinism metrics for a batch of successful runs.

    ``outputs`` and ``transcripts`` are parallel sequences, one entry per run.

    Returns
        ``runs_analyzed``      how many runs the metrics cover
        ``exact_match_count``  runs whose output is byte-identical to the modal output
        ``unique_outputs``     number of distinct outputs
        ``output_length_variance``  population variance of the output lengths
        ``tool_sequence_consistency``  fraction of runs sharing the modal tool
        sequence (``1.0`` when no run used a tool -- they all share the empty
        sequence)
        ``modal_tool_sequence``  the reference sequence itself, for display
    """
    count = len(outputs)
    if count == 0:
        return {
            "runs_analyzed": 0,
            "exact_match_count": 0,
            "unique_outputs": 0,
            "output_length_variance": 0.0,
            "tool_sequence_consistency": 0.0,
            "modal_tool_sequence": [],
        }

    reference = modal_value(list(outputs))
    lengths = [len(output) for output in outputs]
    signatures = [tool_signature(transcript) for transcript in transcripts]
    modal_signature = modal_value(signatures) or ()

    return {
        "runs_analyzed": count,
        "exact_match_count": sum(1 for output in outputs if output == reference),
        "unique_outputs": len(set(outputs)),
        "output_length_variance": float(statistics.pvariance(lengths)) if count > 1 else 0.0,
        "tool_sequence_consistency": sum(1 for s in signatures if s == modal_signature) / count,
        "modal_tool_sequence": list(modal_signature),
    }
