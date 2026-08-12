"""The judge model provider used by the LLM-as-judge evaluators.

``strands_evals`` evaluators take ``model: Model | str | None`` and hand it
straight to a ``strands.Agent`` (see ``OutputEvaluator.evaluate_async``). This
module always produces a **``Model`` instance** rather than a bare model-id
string, for two reasons:

1. a real ``BedrockModel`` can then be pinned to ``settings.aws_region``, which a
   bare id cannot; and
2. when ``settings.fake_model`` is set the judge must be faked too, otherwise the
   test and E2E suites would reach AWS the moment grading started.

Faking the judge
----------------
The evaluators ask for structured output
(``agent.invoke_async(prompt, structured_output_model=EvaluationOutput)``), which
Strands implements as a *dynamically registered tool* named after the model
class -- ``EvaluationOutput``. So a scripted :class:`FakeModel` that emits a
single tool-use block for that tool is a complete, protocol-accurate judge: the
agent validates the input into an ``EvaluationOutput``, stops the loop, and the
evaluator gets its verdict without a single network call.

:class:`FakeJudgeModel` rewinds its script on every ``stream()`` call so one
instance can serve every case of an experiment, while still recording each call
on ``.calls`` -- which is what lets tests assert that the caller's custom rubric
and ``grader.system_prompt`` actually reached the judge.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends
from strands.models.model import Model
from strands_evals.types.evaluation import EvaluationOutput

from promptatron.config import Settings, get_settings
from promptatron.engine.fake_model import FakeModel, ToolUseStep

# A judge builder: model id -> model provider. The seam tests override.
JudgeFactory = Callable[[str], Model]

# Strands names the structured-output tool after the pydantic model class.
STRUCTURED_OUTPUT_TOOL_NAME = EvaluationOutput.__name__

DEFAULT_JUDGE_MODEL_ID = "amazon.nova-pro-v1:0"


def judge_verdict_script(
    *,
    score: float = 0.95,
    test_pass: bool = True,
    reason: str = "[fake-judge] outputs agree on tools, decisions and outcome",
    label: str | None = "A",
) -> list[ToolUseStep]:
    """A one-step script that answers with a structured ``EvaluationOutput``."""
    return [
        ToolUseStep(
            name=STRUCTURED_OUTPUT_TOOL_NAME,
            input={"score": score, "test_pass": test_pass, "reason": reason, "label": label},
        )
    ]


class FakeJudgeModel(FakeModel):
    """A scripted judge: always answers with the same structured verdict.

    Unlike a plain :class:`FakeModel`, the script is rewound at the start of
    every ``stream()`` call, so the same instance can judge every case in an
    experiment (a normal ``FakeModel`` would run out of script after the first).
    """

    def __init__(
        self,
        *,
        score: float = 0.95,
        test_pass: bool = True,
        reason: str = "[fake-judge] outputs agree on tools, decisions and outcome",
        label: str | None = "A",
        model_id: str = DEFAULT_JUDGE_MODEL_ID,
        script: list[Any] | None = None,
        **model_config: Any,
    ) -> None:
        super().__init__(
            script=script
            or judge_verdict_script(score=score, test_pass=test_pass, reason=reason, label=label),
            model_id=model_id,
            **model_config,
        )

    def stream(self, *args: Any, **kwargs: Any):  # type: ignore[override]
        self._cursor = 0
        return super().stream(*args, **kwargs)

    @property
    def prompts(self) -> list[str]:
        """The concatenated user text of every judge call, in order."""
        texts: list[str] = []
        for call in self.calls:
            for message in call.messages:
                if message.get("role") == "user":
                    texts.append(
                        "".join(
                            block["text"] for block in message.get("content", []) if "text" in block
                        )
                    )
        return texts

    @property
    def system_prompts(self) -> list[str | None]:
        """The system prompt of every judge call, in order."""
        return [call.system_prompt for call in self.calls]


def build_judge_model(model_id: str, settings: Settings) -> Model:
    """Build the judge model provider for ``model_id``."""
    if settings.fake_model:
        return FakeJudgeModel(model_id=model_id)

    # Imported lazily so a fake-judge evaluation never constructs a boto session.
    from strands.models.bedrock import BedrockModel

    return BedrockModel(model_id=model_id, region_name=settings.aws_region, streaming=True)


def get_judge_factory(settings: Settings = Depends(get_settings)) -> JudgeFactory:
    """The judge builder used by ``POST /evaluations``.

    A FastAPI dependency purely so tests can swap in a scripted judge without
    touching settings or the environment -- the mirror image of
    ``routers.runs.get_model_factory``.
    """
    return lambda model_id: build_judge_model(model_id, settings)
