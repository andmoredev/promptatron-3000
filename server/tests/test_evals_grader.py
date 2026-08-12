"""Unit tests for the grading half: local metrics, bands, and the judge call.

Everything here drives a scripted :class:`FakeJudgeModel` -- the judge answers
with a real structured-output tool use, so the whole ``strands_evals`` path
(``Experiment`` -> ``OutputEvaluator`` -> ``strands.Agent``) runs for real
without touching AWS.
"""

import pytest

from promptatron.engine.fake_model import Error, Text
from promptatron.evals import grader, metrics, rubrics
from promptatron.evals.judge import (
    STRUCTURED_OUTPUT_TOOL_NAME,
    FakeJudgeModel,
    build_judge_model,
)
from promptatron.evals.outcomes import RunOutcome
from promptatron.evals.schemas import GraderConfig
from promptatron.config import Settings


def outcome(index: int, output: str, transcript: list | None = None) -> RunOutcome:
    return RunOutcome(
        index=index,
        run_id=f"run-{index}",
        status="completed",
        output=output,
        user_prompt="Assess order B456",
        tool_transcript=transcript or [],
    )


# --------------------------------------------------------------------------- #
# Local (LLM-free) metrics
# --------------------------------------------------------------------------- #


def test_identical_outputs_are_perfectly_deterministic():
    result = metrics.local_metrics(["same"] * 4, [[]] * 4)

    assert result["runs_analyzed"] == 4
    assert result["exact_match_count"] == 4
    assert result["unique_outputs"] == 1
    assert result["output_length_variance"] == 0.0
    assert result["tool_sequence_consistency"] == 1.0


def test_diverging_outputs_are_counted_against_the_modal_response():
    result = metrics.local_metrics(["a", "a", "bbbb"], [[]] * 3)

    assert result["exact_match_count"] == 2
    assert result["unique_outputs"] == 2
    assert result["output_length_variance"] == pytest.approx(2.0)


def test_tool_consistency_is_the_modal_signature_share():
    call = {"name": "getCarrierStatus", "input": {"order_id": "B456"}}
    other = {"name": "getCarrierStatus", "input": {"order_id": "OTHER"}}

    result = metrics.local_metrics(["x"] * 4, [[call], [call], [call], [other]])

    assert result["tool_sequence_consistency"] == 0.75
    assert result["modal_tool_sequence"] == ['getCarrierStatus({"order_id": "B456"})']


def test_tool_signature_covers_name_and_input():
    assert metrics.tool_signature([{"name": "t", "input": {"b": 2, "a": 1}}]) == (
        't({"a": 1, "b": 2})',
    )
    assert metrics.tool_signature(None) == ()


def test_score_bands_follow_the_legacy_grader():
    assert [rubrics.score_to_grade(s) for s in (100, 90, 89, 70, 69, 50, 49, 30, 29, 0)] == [
        "A",
        "A",
        "B",
        "B",
        "C",
        "C",
        "D",
        "D",
        "F",
        "F",
    ]


# --------------------------------------------------------------------------- #
# The judge
# --------------------------------------------------------------------------- #


async def test_custom_rubric_and_system_prompt_reach_the_judge():
    """The legacy bug: graderService.js accepted a custom prompt and dropped it."""
    judge_model = FakeJudgeModel()
    outcomes = [outcome(i, "the same answer") for i in range(3)]

    result = await grader.judge(
        outcomes,
        kind="determinism",
        rubric="RUBRIC-SENTINEL: only score odd-numbered runs",
        grader=GraderConfig(model_id="amazon.nova-pro-v1:0", system_prompt="SYSTEM-SENTINEL"),
        judge_factory=lambda _model_id: judge_model,
    )

    assert result.error is None
    assert len(judge_model.calls) == 3
    assert set(judge_model.system_prompts) == {"SYSTEM-SENTINEL"}
    assert all("RUBRIC-SENTINEL" in prompt for prompt in judge_model.prompts)
    # The default rubric is replaced, not appended to.
    assert not any(rubrics.DETERMINISM_RUBRIC in prompt for prompt in judge_model.prompts)


async def test_defaults_are_the_ported_determinism_prompts():
    judge_model = FakeJudgeModel()

    await grader.judge(
        [outcome(i, "answer") for i in range(2)],
        kind="determinism",
        rubric=None,
        grader=GraderConfig(),
        judge_factory=lambda _model_id: judge_model,
    )

    assert set(judge_model.system_prompts) == {rubrics.DETERMINISM_SYSTEM_PROMPT}
    assert all(rubrics.DETERMINISM_RUBRIC in prompt for prompt in judge_model.prompts)
    # Tool usage consistency stays the highest-priority criterion.
    assert "HIGHEST PRIORITY" in rubrics.DETERMINISM_RUBRIC


async def test_the_modal_run_is_the_reference_every_case_is_judged_against():
    judge_model = FakeJudgeModel()
    outcomes = [outcome(0, "majority"), outcome(1, "majority"), outcome(2, "outlier")]

    await grader.judge(
        outcomes,
        kind="determinism",
        rubric=None,
        grader=GraderConfig(),
        judge_factory=lambda _model_id: judge_model,
    )

    assert all("<ExpectedOutput>majority</ExpectedOutput>" in p for p in judge_model.prompts)


async def test_tool_runs_add_a_trajectory_judge():
    judge_model = FakeJudgeModel()
    call = {"name": "getCarrierStatus", "input": {"order_id": "B456"}}
    outcomes = [outcome(i, "answer", [call]) for i in range(2)]

    result = await grader.judge(
        outcomes,
        kind="determinism",
        rubric=None,
        grader=GraderConfig(),
        judge_factory=lambda _model_id: judge_model,
    )

    # Two evaluators x two cases.
    assert len(judge_model.calls) == 4
    assert "tool_consistency_judge_score" in result.metrics
    assert any(rubrics.TOOL_CONSISTENCY_RUBRIC in prompt for prompt in judge_model.prompts)
    assert any("<Trajectory>" in prompt for prompt in judge_model.prompts)


async def test_grade_kind_judges_each_run_on_its_own_merits():
    judge_model = FakeJudgeModel()
    outcomes = [outcome(0, "first answer"), outcome(1, "second answer")]

    result = await grader.judge(
        outcomes,
        kind="grade",
        rubric=None,
        grader=GraderConfig(),
        judge_factory=lambda _model_id: judge_model,
    )

    assert result.grade == "A"
    assert set(judge_model.system_prompts) == {rubrics.GRADE_SYSTEM_PROMPT}
    # No reference output: nothing is compared against a modal run.
    assert not any("<ExpectedOutput>" in prompt for prompt in judge_model.prompts)


async def test_the_score_is_the_mean_verdict_mapped_onto_a_band():
    judge_model = FakeJudgeModel(score=0.62, test_pass=False, label="C")

    result = await grader.judge(
        [outcome(i, f"answer {i}") for i in range(2)],
        kind="determinism",
        rubric=None,
        grader=GraderConfig(),
        judge_factory=lambda _model_id: judge_model,
    )

    assert result.score == 62
    assert result.grade == "C"
    assert result.metrics["judge_pass_rate"] == 0.0


async def test_a_judge_that_cannot_be_built_degrades_to_judge_error():
    def broken_factory(_model_id):
        raise RuntimeError("no bedrock credentials")

    result = await grader.judge(
        [outcome(0, "answer")],
        kind="determinism",
        rubric=None,
        grader=GraderConfig(),
        judge_factory=broken_factory,
    )

    assert result.error == "no bedrock credentials"
    assert result.grade is None and result.score is None


async def test_a_judge_that_fails_mid_stream_degrades_to_judge_error():
    """``Experiment`` isolates evaluator errors into rows -- they must not read as an F."""
    judge_model = FakeJudgeModel(script=[Error(RuntimeError("judge exploded"))])

    result = await grader.judge(
        [outcome(i, "answer") for i in range(2)],
        kind="determinism",
        rubric=None,
        grader=GraderConfig(),
        judge_factory=lambda _model_id: judge_model,
    )

    assert result.grade is None
    assert result.score is None
    assert "judge exploded" in result.error


async def test_no_successful_runs_is_a_judge_error_not_a_grade():
    result = await grader.judge(
        [],
        kind="determinism",
        rubric=None,
        grader=GraderConfig(),
        judge_factory=lambda _model_id: FakeJudgeModel(),
    )

    assert result.error == "No successful runs to grade"


# --------------------------------------------------------------------------- #
# Judge model construction
# --------------------------------------------------------------------------- #


def test_fake_model_settings_fake_the_judge_too():
    model = build_judge_model("amazon.nova-pro-v1:0", Settings(fake_model=True))

    assert isinstance(model, FakeJudgeModel)
    assert model.get_config()["model_id"] == "amazon.nova-pro-v1:0"


def test_the_fake_judge_answers_with_the_structured_output_tool():
    assert STRUCTURED_OUTPUT_TOOL_NAME == "EvaluationOutput"
    step = FakeJudgeModel()._steps[0]
    assert step.name == "EvaluationOutput"
    assert set(step.input) == {"score", "test_pass", "reason", "label"}


async def test_the_fake_judge_rewinds_so_one_instance_serves_every_case():
    model = FakeJudgeModel(script=[Text("hi")])

    async def turn() -> list[dict]:
        return [event async for event in model.stream([], None, None)]

    first, second = await turn(), await turn()

    # A plain FakeModel would have run out of script on the second turn.
    assert first == second
    assert any("contentBlockDelta" in event for event in second)
    assert len(model.calls) == 2
