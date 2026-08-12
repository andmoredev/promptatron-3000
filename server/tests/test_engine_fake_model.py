"""Tests for the scripted FakeModel and the strands->internal event mapper."""

import pytest
from strands import Agent

from promptatron.engine.fake_model import (
    Error,
    FakeModel,
    GuardrailTrace,
    Reasoning,
    Text,
    ToolUseStep,
)
from promptatron.engine.mapper import EventMapper


async def _chunks(model: FakeModel, messages=None, **kwargs):
    stream = model.stream(messages if messages is not None else [], **kwargs)
    return [chunk async for chunk in stream]


# --------------------------------------------------------------------------- #
# Script handling
# --------------------------------------------------------------------------- #


async def test_text_only_script_is_one_turn_ending_with_end_turn():
    model = FakeModel(script=[Text("a"), Text("b")])

    chunks = await _chunks(model)

    texts = [
        chunk["contentBlockDelta"]["delta"]["text"]
        for chunk in chunks
        if "contentBlockDelta" in chunk
    ]
    assert texts == ["a", "b"]
    assert chunks[0] == {"messageStart": {"role": "assistant"}}
    assert any(chunk.get("messageStop", {}).get("stopReason") == "end_turn" for chunk in chunks)
    assert chunks[-1]["metadata"]["usage"]["totalTokens"] == 18


async def test_script_splits_into_turns_at_the_tool_use_boundary():
    model = FakeModel(
        script=[Text("Hello "), ToolUseStep("getCarrierStatus", {"order_id": "B456"}), Text("done")]
    )

    first = await _chunks(model)
    second = await _chunks(model)

    assert any(chunk.get("messageStop", {}).get("stopReason") == "tool_use" for chunk in first)
    assert any(chunk.get("messageStop", {}).get("stopReason") == "end_turn" for chunk in second)
    assert [
        chunk["contentBlockDelta"]["delta"]["text"]
        for chunk in second
        if "contentBlockDelta" in chunk
    ] == ["done"]


async def test_consecutive_tool_uses_stay_in_one_turn():
    model = FakeModel(
        script=[
            ToolUseStep("getCarrierStatus", {"order_id": "B456"}),
            ToolUseStep("getSla", {"order_id": "B456"}),
            Text("after"),
        ]
    )

    first = await _chunks(model)

    starts = [
        chunk["contentBlockStart"]["start"]["toolUse"]["name"]
        for chunk in first
        if "contentBlockStart" in chunk and "toolUse" in chunk["contentBlockStart"]["start"]
    ]
    assert starts == ["getCarrierStatus", "getSla"]


async def test_tool_input_is_streamed_in_chunks_and_ids_are_unique():
    model = FakeModel(
        script=[ToolUseStep("getCarrierStatus", {"order_id": "B456"}, chunk_size=4)]
    )

    chunks = await _chunks(model)

    partials = [
        chunk["contentBlockDelta"]["delta"]["toolUse"]["input"]
        for chunk in chunks
        if "contentBlockDelta" in chunk
    ]
    assert len(partials) > 1
    assert "".join(partials) == '{"order_id": "B456"}'


async def test_error_step_raises_mid_stream():
    model = FakeModel(script=[Text("partial"), Error(RuntimeError("boom"))])

    with pytest.raises(RuntimeError, match="boom"):
        await _chunks(model)


async def test_guardrail_trace_step_rides_on_the_metadata_chunk():
    assessment = {"inputAssessment": {"gr-1": {"topicPolicy": {"topics": []}}}}
    model = FakeModel(script=[Text("hi"), GuardrailTrace(assessment)])

    chunks = await _chunks(model)

    assert chunks[-1]["metadata"]["trace"] == {"guardrail": assessment}


async def test_dict_and_string_shorthand_steps_are_accepted():
    model = FakeModel(script=["plain", {"text": "b"}, {"reasoning": "why"}])

    chunks = await _chunks(model)

    assert chunks[2]["contentBlockDelta"]["delta"]["text"] == "plain"
    assert any(
        "reasoningContent" in chunk.get("contentBlockDelta", {}).get("delta", {})
        for chunk in chunks
    )


async def test_tool_use_dict_shorthand_is_accepted():
    model = FakeModel(
        script=[{"tool_use": {"name": "getSla", "input": {"order_id": "B1"}, "id": "tu-7"}}]
    )

    chunks = await _chunks(model)

    starts = [c["contentBlockStart"] for c in chunks if "contentBlockStart" in c]
    tool_use_start = next(c for c in starts if "toolUse" in c.get("start", {}))
    assert tool_use_start["start"]["toolUse"]["toolUseId"] == "tu-7"
    assert tool_use_start["start"]["toolUse"]["name"] == "getSla"


async def test_error_dict_shorthand_raises_mid_stream():
    model = FakeModel(script=[{"error": RuntimeError("boom via dict shorthand")}])

    with pytest.raises(RuntimeError, match="boom via dict shorthand"):
        await _chunks(model)


async def test_guardrail_trace_dict_shorthand_rides_on_the_metadata_chunk():
    model = FakeModel(script=[Text("hi"), {"guardrail_trace": {"blocked": True}}])

    chunks = await _chunks(model)

    metadata = next(c["metadata"] for c in chunks if "metadata" in c)
    assert metadata["trace"]["guardrail"] == {"blocked": True}


def test_unrecognized_step_is_rejected():
    with pytest.raises(ValueError, match="Unrecognized"):
        FakeModel(script=[object()])


async def test_calls_record_messages_system_prompt_and_tool_specs():
    model = FakeModel(script=[Text("ok")])
    agent = Agent(model=model, system_prompt="be terse", callback_handler=None)

    async for _event in agent.stream_async("what is up"):
        pass

    assert model.first_user_text == "what is up"
    assert model.calls[0].system_prompt == "be terse"
    assert model.calls[0].tool_specs is None


def test_first_user_text_without_a_call_is_an_assertion():
    with pytest.raises(AssertionError):
        assert FakeModel().first_user_text


async def test_model_config_is_readable_and_updatable():
    model = FakeModel(script=[], model_id="fake-x", temperature=0.2)

    assert model.get_config()["model_id"] == "fake-x"
    assert model.get_config()["temperature"] == 0.2

    model.update_config(top_p=0.9)
    assert model.get_config()["top_p"] == 0.9


async def test_structured_output_is_unsupported():
    with pytest.raises(NotImplementedError):
        FakeModel().structured_output(object, [])


async def test_reasoning_steps_reach_the_agent_stream():
    model = FakeModel(script=[Reasoning("thinking"), Text("answer")])
    agent = Agent(model=model, callback_handler=None)

    reasoning = [
        event async for event in agent.stream_async("hi") if event.get("reasoning") is True
    ]

    assert any(event.get("reasoningText") == "thinking" for event in reasoning)


# --------------------------------------------------------------------------- #
# Mapper
# --------------------------------------------------------------------------- #


def test_mapper_ignores_lifecycle_and_derived_duplicate_events():
    mapper = EventMapper()

    assert mapper.map({"init_event_loop": True}) == []
    assert mapper.map({"start": True}) == []
    assert mapper.map({"data": "hi", "delta": {"text": "hi"}}) == []
    assert mapper.map({"type": "tool_use_stream", "delta": {}, "current_tool_use": {}}) == []
    assert mapper.unknown_count == 0


def test_mapper_counts_unknown_events_without_raising():
    mapper = EventMapper()

    assert mapper.map({"totally_new_event": 1}) == []
    assert mapper.map({"event": {"brandNewChunk": {}}}) == []
    assert mapper.map({"event": {"contentBlockDelta": {"delta": {"mystery": 1}}}}) == []
    assert mapper.unknown_count == 3


def test_mapper_attributes_tool_input_deltas_to_their_block():
    mapper = EventMapper()

    mapper.map(
        {
            "event": {
                "contentBlockStart": {
                    "start": {"toolUse": {"toolUseId": "tu-1", "name": "getSla"}},
                    "contentBlockIndex": 3,
                }
            }
        }
    )
    events = mapper.map(
        {
            "event": {
                "contentBlockDelta": {
                    "delta": {"toolUse": {"input": '{"a":'}},
                    "contentBlockIndex": 3,
                }
            }
        }
    )

    assert events[0].type == "tool_input_delta"
    assert events[0].tool_use_id == "tu-1"
    assert events[0].model_dump(by_alias=True)["json"] == '{"a":'


def test_mapper_accepts_tool_use_id_supplied_on_the_delta():
    mapper = EventMapper()

    events = mapper.map(
        {
            "event": {
                "contentBlockDelta": {
                    "delta": {"toolUse": {"toolUseId": "tu-9", "name": "x", "input": "{}"}},
                }
            }
        }
    )

    assert events[0].tool_use_id == "tu-9"


def test_mapper_emits_guardrail_trace_from_metadata():
    mapper = EventMapper()

    events = mapper.map({"event": {"metadata": {"trace": {"guardrail": {"blocked": True}}}}})

    assert events[0].type == "guardrail_trace"
    assert events[0].assessment == {"blocked": True}


def test_mapper_ignores_metadata_without_a_guardrail_trace():
    mapper = EventMapper()

    assert mapper.map({"event": {"metadata": {"usage": {"inputTokens": 1}}}}) == []


def test_mapper_message_event_defaults_missing_role_and_content():
    mapper = EventMapper()

    events = mapper.map({"message": {}})

    assert events[0].role == "assistant"
    assert events[0].content == []


def test_mapper_tool_use_start_defaults_missing_id_and_name_to_empty_string():
    mapper = EventMapper()

    events = mapper.map(
        {
            "event": {
                "contentBlockStart": {
                    "start": {"toolUse": {"unrecognizedKey": True}},
                    "contentBlockIndex": 0,
                }
            }
        }
    )

    assert events[0].tool_use_id == ""
    assert events[0].name == ""


def test_mapper_tool_input_delta_defaults_a_missing_name_on_the_delta():
    mapper = EventMapper()

    events = mapper.map(
        {
            "event": {
                "contentBlockDelta": {
                    "delta": {"toolUse": {"toolUseId": "tu-1", "input": "{}"}},
                    "contentBlockIndex": 0,
                }
            }
        }
    )

    assert events[0].tool_use_id == "tu-1"
    # The (id, name) pair recorded for this block now carries an empty name.
    assert mapper._tool_uses_by_block[0] == ("tu-1", "")


def test_mapper_tool_input_delta_for_an_unseen_block_defaults_to_an_empty_id():
    """A delta with no prior ``contentBlockStart`` for this index (block_index
    is never in ``_tool_uses_by_block``) falls back to ``("", "")``."""
    mapper = EventMapper()

    events = mapper.map(
        {
            "event": {
                "contentBlockDelta": {
                    "delta": {"toolUse": {"input": "{}"}},
                    "contentBlockIndex": 99,
                }
            }
        }
    )

    assert events[0].tool_use_id == ""


def test_mapper_ignores_citation_deltas():
    mapper = EventMapper()

    events = mapper.map(
        {"event": {"contentBlockDelta": {"delta": {"citation": {"foo": "bar"}}}}}
    )

    assert events == []
    assert mapper.unknown_count == 0


def test_mapper_result_without_metrics_yields_no_event():
    mapper = EventMapper()

    class _NoMetricsResult:
        pass

    assert mapper.map({"result": _NoMetricsResult()}) == []


def test_mapper_result_with_metrics_emits_a_metrics_event():
    mapper = EventMapper()

    class _Metrics:
        accumulated_usage = {"inputTokens": 3, "outputTokens": 4, "totalTokens": 7}
        accumulated_metrics = {"latencyMs": 42}
        cycle_count = 2

    class _Result:
        metrics = _Metrics()

    events = mapper.map({"result": _Result()})

    assert len(events) == 1
    assert events[0].type == "metrics"
    assert events[0].total_tokens == 7
    assert events[0].latency_ms == 42
    assert events[0].cycle_count == 2
