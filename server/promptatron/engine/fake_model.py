"""A scripted, AWS-free :class:`strands.models.model.Model` implementation.

``FakeModel`` replays a fixed script of text/reasoning/tool-use steps as a real
Bedrock-shaped ``StreamEvent`` sequence, so an actual ``strands.Agent`` -- with
real tools, the real event loop and the real tool round-trip -- can be exercised
without touching AWS. It is a first-class deliverable: the run engine uses it
whenever ``PROMPTATRON_FAKE_MODEL`` is set, and the eval/E2E suites reuse it.

Script format
-------------
A script is a *flat* list of steps, in the order the model should "say" them::

    FakeModel(script=[
        Text("Hello "),
        Text("world"),
        ToolUseStep("getCarrierStatus", {"order_id": "B456"}),
        Text(" done"),
    ])

Steps may also be given as plain dicts (handy in JSON-ish fixtures)::

    {"text": "Hello "}
    {"reasoning": "thinking..."}
    {"tool_use": {"name": "getCarrierStatus", "input": {...}, "id": "tu-1"}}
    {"error": RuntimeError("boom")}          # raise mid-stream
    {"guardrail_trace": {...}}               # emitted on the metadata chunk

Turn splitting
--------------
The Strands agent loop calls ``stream()`` once per turn. The flat script is
sliced into turns automatically: a turn ends when the script is exhausted, or
at the first step that follows a tool use (so the agent stops with
``stopReason="tool_use"``, runs the tools, and calls back for the next turn).
Consecutive tool-use steps stay in the same turn, which models parallel tool
calls.

Recording
---------
Every call records the exact ``messages``/``system_prompt``/``tool_specs`` it
received on :attr:`FakeModel.calls` (and :attr:`received_messages`), which is
what lets tests assert on the composed prompt that actually reached the model.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator, AsyncIterable
from dataclasses import dataclass, field
from typing import Any

from strands.models.model import Model
from strands.types.content import Messages, SystemContentBlock
from strands.types.streaming import StreamEvent
from strands.types.tools import ToolChoice, ToolSpec

# --------------------------------------------------------------------------- #
# Script steps
# --------------------------------------------------------------------------- #


@dataclass
class Text:
    """Emit ``text`` as one ``contentBlockDelta`` text chunk."""

    text: str


@dataclass
class Reasoning:
    """Emit ``text`` as one ``contentBlockDelta`` reasoningContent chunk."""

    text: str


@dataclass
class ToolUseStep:
    """Emit a tool-use content block (start + input deltas + stop).

    ``input`` is serialized to JSON and streamed in ``chunk_size`` pieces so
    consumers see partial ``tool_input_delta`` events, exactly as Bedrock does.
    """

    name: str
    input: dict[str, Any] = field(default_factory=dict)
    id: str | None = None
    chunk_size: int = 16


@dataclass
class Error:
    """Raise ``exception`` at this point in the stream."""

    exception: BaseException


@dataclass
class GuardrailTrace:
    """Attach ``assessment`` to this turn's trailing ``metadata`` chunk."""

    assessment: dict[str, Any]


Step = Text | Reasoning | ToolUseStep | Error | GuardrailTrace


def _coerce_step(step: Any) -> Step:
    """Accept dataclass steps, bare strings, or dict shorthand."""
    if isinstance(step, Text | Reasoning | ToolUseStep | Error | GuardrailTrace):
        return step
    if isinstance(step, str):
        return Text(step)
    if isinstance(step, dict):
        if "text" in step:
            return Text(step["text"])
        if "reasoning" in step:
            return Reasoning(step["reasoning"])
        if "tool_use" in step:
            spec = step["tool_use"]
            return ToolUseStep(
                name=spec["name"],
                input=spec.get("input", {}),
                id=spec.get("id"),
                chunk_size=spec.get("chunk_size", 16),
            )
        if "error" in step:
            return Error(step["error"])
        if "guardrail_trace" in step:
            return GuardrailTrace(step["guardrail_trace"])
    raise ValueError(f"Unrecognized FakeModel script step: {step!r}")


@dataclass
class RecordedCall:
    """One ``stream()`` invocation, as the agent made it."""

    messages: Messages
    tool_specs: list[ToolSpec] | None
    system_prompt: str | None


class FakeModel(Model):
    """Scripted model provider that speaks the Bedrock streaming event shape."""

    def __init__(
        self,
        script: list[Any] | None = None,
        *,
        model_id: str = "fake-model",
        usage_per_turn: tuple[int, int] = (11, 7),
        latency_ms: int = 5,
        **model_config: Any,
    ) -> None:
        self._steps: list[Step] = [_coerce_step(step) for step in (script or [])]
        self._cursor = 0
        self._tool_use_seq = 0
        self.config: dict[str, Any] = {"model_id": model_id, **model_config}
        self.usage_per_turn = usage_per_turn
        self.latency_ms = latency_ms
        self.calls: list[RecordedCall] = []

    # ------------------------------------------------------------------ #
    # Recording helpers (test affordances)
    # ------------------------------------------------------------------ #

    @property
    def received_messages(self) -> list[Messages]:
        """The ``messages`` list handed to each ``stream()`` call, in order."""
        return [call.messages for call in self.calls]

    @property
    def first_user_text(self) -> str:
        """Concatenated text of the first user message of the first call."""
        if not self.calls:
            raise AssertionError("FakeModel was never invoked")
        for message in self.calls[0].messages:
            if message.get("role") == "user":
                return "".join(
                    block["text"] for block in message.get("content", []) if "text" in block
                )
        raise AssertionError("no user message was sent to FakeModel")

    # ------------------------------------------------------------------ #
    # Model interface
    # ------------------------------------------------------------------ #

    def update_config(self, **model_config: Any) -> None:
        self.config.update(model_config)

    def get_config(self) -> dict[str, Any]:
        return self.config

    def structured_output(
        self,
        output_model: type,
        prompt: Messages,
        system_prompt: str | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[dict[str, Any], None]:
        raise NotImplementedError("FakeModel does not support structured output")

    def stream(
        self,
        messages: Messages,
        tool_specs: list[ToolSpec] | None = None,
        system_prompt: str | None = None,
        *,
        tool_choice: ToolChoice | None = None,
        system_prompt_content: list[SystemContentBlock] | None = None,
        invocation_state: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> AsyncIterable[StreamEvent]:
        self.calls.append(
            RecordedCall(
                messages=[dict(message) for message in messages],
                tool_specs=tool_specs,
                system_prompt=system_prompt,
            )
        )
        return self._stream_turn()

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #

    def _next_turn(self) -> list[Step]:
        """Slice the next turn's steps off the flat script.

        A turn runs to the end of the script, or up to (excluding) the first
        non-tool-use step that follows a tool use.
        """
        turn: list[Step] = []
        saw_tool_use = False
        while self._cursor < len(self._steps):
            step = self._steps[self._cursor]
            if saw_tool_use and not isinstance(step, ToolUseStep):
                break
            if isinstance(step, ToolUseStep):
                saw_tool_use = True
            turn.append(step)
            self._cursor += 1
        return turn

    async def _stream_turn(self) -> AsyncGenerator[StreamEvent, None]:
        turn = self._next_turn()
        block_index = 0
        has_tool_use = False
        trace: dict[str, Any] | None = None

        yield {"messageStart": {"role": "assistant"}}

        for step in turn:
            match step:
                case Error():
                    raise step.exception

                case GuardrailTrace():
                    trace = {"guardrail": step.assessment}

                case Text():
                    yield {"contentBlockStart": {"start": {}, "contentBlockIndex": block_index}}
                    yield {
                        "contentBlockDelta": {
                            "delta": {"text": step.text},
                            "contentBlockIndex": block_index,
                        }
                    }
                    yield {"contentBlockStop": {"contentBlockIndex": block_index}}
                    block_index += 1

                case Reasoning():
                    yield {"contentBlockStart": {"start": {}, "contentBlockIndex": block_index}}
                    yield {
                        "contentBlockDelta": {
                            "delta": {"reasoningContent": {"text": step.text}},
                            "contentBlockIndex": block_index,
                        }
                    }
                    yield {"contentBlockStop": {"contentBlockIndex": block_index}}
                    block_index += 1

                case ToolUseStep():
                    has_tool_use = True
                    self._tool_use_seq += 1
                    tool_use_id = step.id or f"tooluse_fake_{self._tool_use_seq}"
                    yield {
                        "contentBlockStart": {
                            "start": {"toolUse": {"toolUseId": tool_use_id, "name": step.name}},
                            "contentBlockIndex": block_index,
                        }
                    }
                    payload = json.dumps(step.input)
                    size = max(1, step.chunk_size)
                    for offset in range(0, len(payload), size):
                        yield {
                            "contentBlockDelta": {
                                "delta": {"toolUse": {"input": payload[offset : offset + size]}},
                                "contentBlockIndex": block_index,
                            }
                        }
                    yield {"contentBlockStop": {"contentBlockIndex": block_index}}
                    block_index += 1

        yield {"messageStop": {"stopReason": "tool_use" if has_tool_use else "end_turn"}}

        input_tokens, output_tokens = self.usage_per_turn
        metadata: dict[str, Any] = {
            "usage": {
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "totalTokens": input_tokens + output_tokens,
            },
            "metrics": {"latencyMs": self.latency_ms},
        }
        if trace is not None:
            metadata["trace"] = trace
        yield {"metadata": metadata}
