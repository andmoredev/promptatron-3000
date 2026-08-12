"""Request models for ``POST /api/v1/evaluations``."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from promptatron.engine.schemas import RunRequest
from promptatron.errors import BadRequestError
from promptatron.evals.judge import DEFAULT_JUDGE_MODEL_ID

MIN_RUNS = 2
MAX_RUNS = 25


class GraderConfig(BaseModel):
    """Which model judges, and with what system prompt.

    ``system_prompt`` is the fix for the legacy bug: ``graderService.js`` accepted
    a custom grader prompt and then never sent it. Here it reaches the judge
    agent verbatim (see :mod:`promptatron.evals.grader`).
    """

    model_config = ConfigDict(extra="ignore")

    model_id: str = Field(default=DEFAULT_JUDGE_MODEL_ID, min_length=1)
    system_prompt: str | None = None


class EvaluationRequest(BaseModel):
    """Body of ``POST /api/v1/evaluations``.

    ``kind="determinism"``
        Execute ``run_config`` ``n`` times and grade the batch for determinism.
    ``kind="grade"``
        Grade the already-stored runs named by ``run_ids``.

    Unknown fields are ignored (same policy as ``RunRequest``), and ``n`` is
    clamped into ``[2, 25]`` rather than rejected.
    """

    model_config = ConfigDict(extra="ignore")

    kind: Literal["determinism", "grade"]
    run_config: RunRequest | None = None
    n: int = 10
    run_ids: list[str] = Field(default_factory=list)
    rubric: str | None = None
    grader: GraderConfig = Field(default_factory=GraderConfig)
    #: Which lane executes this evaluation -- in-process ("local", the default)
    #: or the AgentCore Runtime worker ("cloud"). See ``docs/cloud-evals.md``.
    execution: Literal["local", "cloud"] = "local"

    @model_validator(mode="after")
    def _check_kind_requirements(self) -> EvaluationRequest:
        if self.kind == "determinism":
            if self.run_config is None:
                raise BadRequestError("run_config is required when kind is 'determinism'")
            # The runs are consumed internally, never streamed to a client.
            self.run_config = self.run_config.model_copy(update={"stream": False})
            self.n = max(MIN_RUNS, min(self.n, MAX_RUNS))
        elif not self.run_ids:
            raise BadRequestError("run_ids is required when kind is 'grade'")
        return self

    def stored_config(self) -> dict:
        """The ``config`` JSON persisted on the evaluation row."""
        return {
            "kind": self.kind,
            "n": self.n if self.kind == "determinism" else len(self.run_ids),
            "run_config": self.run_config.model_dump() if self.run_config else None,
            "rubric": self.rubric,
            "grader": self.grader.model_dump(),
        }

    @property
    def planned_runs(self) -> int:
        """How many runs this evaluation will report on."""
        return self.n if self.kind == "determinism" else len(self.run_ids)
