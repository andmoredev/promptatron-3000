"""Strands agent events -> :mod:`promptatron.engine.events` internal events.

``Agent.stream_async`` yields plain dicts (``TypedEvent.as_dict()``), so events
are identified by their key signature rather than their class. The full set the
agent can emit is enumerated in ``strands/types/_events.py``; this module maps
every one of them, and counts anything it does not recognize
(:attr:`EventMapper.unknown_count`) instead of guessing.

Two sources of truth overlap in that stream: the raw provider chunk
(``{"event": <StreamEvent>}``, emitted by ``streaming.process_stream`` for every
chunk) and the typed convenience events derived from it (``{"data": ...}``,
``{"type": "tool_use_stream", ...}``, ``{"reasoningText": ...}``). Mapping the
raw chunk is strictly richer -- it is the only place tool-use ids, tool input
deltas and guardrail traces all appear -- so the raw chunk is the mapped source
and the derived duplicates are deliberately dropped.
"""

from __future__ import annotations

import logging
from typing import Any

from promptatron.engine.events import (
    GuardrailTraceEvent,
    MessageEvent,
    MetricsEvent,
    ReasoningDeltaEvent,
    RunEvent,
    TextDeltaEvent,
    ToolInputDeltaEvent,
    ToolUseStartEvent,
)

logger = logging.getLogger(__name__)

# Agent lifecycle/control events that carry nothing for the NDJSON stream.
_IGNORED_CONTROL_KEYS = frozenset(
    {
        "init_event_loop",
        "start",
        "start_event_loop",
        "force_stop",
        "event_loop_throttled_delay",
        "structured_output",
        "callback",
    }
)

# Typed stream events derived from a raw chunk we already mapped.
_DERIVED_DUPLICATE_KEYS = frozenset(
    {
        "data",
        "delta",
        "current_tool_use",
        "citation",
        "reasoningText",
        "reasoningRedactedContent",
        "reasoning_signature",
        "tool_stream_event",
        "tool_cancel_event",
        "tool_interrupt_event",
        "tool_result",
    }
)


class EventMapper:
    """Stateful mapper: one instance per run.

    The state is the content-block-index -> (tool_use_id, name) table needed to
    attribute tool input deltas, which Bedrock only labels on the block *start*.
    """

    def __init__(self) -> None:
        self.unknown_count = 0
        self._tool_uses_by_block: dict[Any, tuple[str, str]] = {}

    def map(self, event: dict[str, Any]) -> list[RunEvent]:
        """Translate one agent event into zero or more internal events."""
        if "event" in event and isinstance(event["event"], dict):
            return self._map_chunk(event["event"])

        if "message" in event and isinstance(event["message"], dict):
            message = event["message"]
            return [
                MessageEvent(
                    role=message.get("role", "assistant"),
                    content=list(message.get("content", [])),
                )
            ]

        if "result" in event:
            return self._map_result(event["result"])

        keys = set(event)
        if keys & _IGNORED_CONTROL_KEYS or keys & _DERIVED_DUPLICATE_KEYS:
            return []

        self.unknown_count += 1
        logger.debug("unmapped strands agent event | keys=%s", sorted(keys))
        return []

    # ------------------------------------------------------------------ #
    # Raw provider chunk (strands.types.streaming.StreamEvent)
    # ------------------------------------------------------------------ #

    def _map_chunk(self, chunk: dict[str, Any]) -> list[RunEvent]:
        match next(iter(chunk), None):
            case "contentBlockStart":
                return self._map_block_start(chunk["contentBlockStart"])
            case "contentBlockDelta":
                return self._map_block_delta(chunk["contentBlockDelta"])
            case "metadata":
                return self._map_metadata(chunk["metadata"])
            case (
                "messageStart"
                | "messageStop"
                | "contentBlockStop"
                | "redactContent"
                | "internalServerException"
                | "modelStreamErrorException"
                | "serviceUnavailableException"
                | "throttlingException"
                | "validationException"
            ):
                # Structural or error chunks: message boundaries are surfaced by the
                # agent's own ``message`` events, and provider exception chunks reach
                # us as raised exceptions (mapped to an ``error`` event by the runner).
                return []
            case _:
                self.unknown_count += 1
                logger.debug("unmapped model stream chunk | keys=%s", sorted(chunk))
                return []

    def _map_block_start(self, start_event: dict[str, Any]) -> list[RunEvent]:
        start = start_event.get("start") or {}
        tool_use = start.get("toolUse")
        if not tool_use:
            return []
        tool_use_id = tool_use.get("toolUseId", "")
        name = tool_use.get("name", "")
        self._tool_uses_by_block[start_event.get("contentBlockIndex")] = (tool_use_id, name)
        return [ToolUseStartEvent(tool_use_id=tool_use_id, name=name)]

    def _map_block_delta(self, delta_event: dict[str, Any]) -> list[RunEvent]:
        delta = delta_event.get("delta") or {}
        block_index = delta_event.get("contentBlockIndex")

        if "text" in delta:
            return [TextDeltaEvent(text=delta["text"])]

        if "toolUse" in delta:
            tool_use_delta = delta["toolUse"]
            # Some providers repeat toolUseId/name on the delta instead of the start.
            if "toolUseId" in tool_use_delta:
                self._tool_uses_by_block[block_index] = (
                    tool_use_delta["toolUseId"],
                    tool_use_delta.get("name", ""),
                )
            tool_use_id, _name = self._tool_uses_by_block.get(block_index, ("", ""))
            return [
                ToolInputDeltaEvent(
                    tool_use_id=tool_use_id,
                    json=tool_use_delta.get("input", ""),
                )
            ]

        if "reasoningContent" in delta:
            text = delta["reasoningContent"].get("text")
            # Signature/redacted-content deltas carry nothing readable.
            return [ReasoningDeltaEvent(text=text)] if text else []

        if "citation" in delta:
            return []

        self.unknown_count += 1
        logger.debug("unmapped content block delta | keys=%s", sorted(delta))
        return []

    def _map_metadata(self, metadata: dict[str, Any]) -> list[RunEvent]:
        # Per-call usage is intentionally not emitted here: the run's ``metrics``
        # event carries the agent's accumulated usage across every cycle.
        guardrail = (metadata.get("trace") or {}).get("guardrail")
        return [GuardrailTraceEvent(assessment=guardrail)] if guardrail else []

    # ------------------------------------------------------------------ #
    # Final AgentResult
    # ------------------------------------------------------------------ #

    def _map_result(self, result: Any) -> list[RunEvent]:
        metrics = getattr(result, "metrics", None)
        if metrics is None:
            return []
        usage = getattr(metrics, "accumulated_usage", {}) or {}
        latency = getattr(metrics, "accumulated_metrics", {}) or {}
        return [
            MetricsEvent(
                input_tokens=usage.get("inputTokens", 0),
                output_tokens=usage.get("outputTokens", 0),
                total_tokens=usage.get("totalTokens", 0),
                latency_ms=latency.get("latencyMs", 0),
                cycle_count=getattr(metrics, "cycle_count", 0),
            )
        ]
