"""The cloud evaluation lane's worker host.

This package is the *host* for cloud-lane evaluations, not the evaluation logic
itself. It is deployed to Amazon Bedrock AgentCore Runtime as a Python 3.12
CodeZip artifact (see ``docs/cloud-evals-infra.md``) and does exactly three
things:

1. :mod:`~promptatron.worker.agentcore_app` — accepts an ``InvokeAgentRuntime``
   payload, acknowledges it immediately, and runs the evaluation as a background
   task inside the runtime.
2. :mod:`~promptatron.worker.ddb` — persists everything the evaluation produces
   to the shared DynamoDB table using the item shapes in ``docs/cloud-evals.md``.
3. :mod:`~promptatron.worker.interfaces` — the narrow seam between this host and
   ``promptatron.evals``, so the two can be built and changed independently.

Nothing in here imports FastAPI, SQLModel, or any other server-only machinery:
the artifact ships the evaluation engine and its dependencies, not the web app.
"""

from __future__ import annotations

__all__ = ["agentcore_app", "ddb", "interfaces"]
