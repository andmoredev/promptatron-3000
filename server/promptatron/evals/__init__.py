"""The evaluation engine: determinism experiments and LLM-as-judge grading.

Layering (each module depends only on the ones above it):

``rubrics``
    The ported grading prompts -- system prompts, rubrics, and the A--F band
    mapping. No behaviour, just text.
``judge``
    Builds the judge model provider (a real ``BedrockModel``, or a scripted
    ``FakeJudgeModel`` when ``settings.fake_model`` is set so nothing touches
    AWS).
``metrics``
    Deterministic, LLM-free metrics over a set of run outcomes.
``schemas`` / ``events``
    The request body and the NDJSON progress event union.
``grader``
    The ``strands_evals`` integration: builds ``Case``/``Experiment`` and turns
    an ``EvaluationReport`` into a grade.
``jobs``
    The per-evaluation event log plus subscriber fan-out, and the module-level
    registry the router cancels/streams through.
``engine``
    The background job body: execute N runs, grade them, persist, emit events.
"""
