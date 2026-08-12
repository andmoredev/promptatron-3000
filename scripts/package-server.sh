#!/usr/bin/env bash
#
# Assembles the FastAPI server's Lambda zip artifact.
#
# The server runs on Lambda UNCHANGED -- no handler, no Mangum, no ASGI
# adapter in the application. The AWS Lambda Web Adapter layer sits in front
# of it: Lambda's `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap` makes the layer
# exec the function's Handler (`run.sh`), that script starts uvicorn on
# $PORT, and the adapter proxies Lambda invocations to it as ordinary HTTP.
# With `AWS_LWA_INVOKE_MODE=response_stream` plus a Function URL in
# `RESPONSE_STREAM` mode, the NDJSON streams from POST /runs survive the trip.
# See docs/serverless-deploy-infra.md for the citations.
#
# So the zip is the same shape as the eval worker's (vendored aarch64 wheels
# + the promptatron package) with two differences:
#
#   * the root entry is a `run.sh` bootstrap, not a Python module, and it must
#     be executable inside the zip -- Lambda execs it directly;
#   * the `worker` extra is NOT installed. bedrock-agentcore (with its
#     OpenTelemetry and MCP tails) belongs to the AgentCore artifact; the
#     server only ever *invokes* the runtime, via boto3.
#
# Like package-eval-worker.sh, the S3 key is content-hashed. CloudFormation
# only rolls a Lambda when a property it can see changes, and for an
# S3-sourced function that property is the key -- upload new bytes under a
# static key and CFN correctly concludes nothing changed, leaving the old code
# serving forever. (rsc-core's AgentArtifactKey lesson, again.)
#
# Usage:
#   scripts/package-server.sh                   # build into .build/server
#   SERVER_BUILD_DIR=/tmp/x scripts/...         # build somewhere else
#   SERVER_PYTHON_PLATFORM=... scripts/...      # override the wheel platform
#   SERVER_PRUNE=0 scripts/...                  # keep the pruned-by-default deps
#
# Writes <build-dir>/artifact.env with ARTIFACT_ZIP / ARTIFACT_SHA /
# ARTIFACT_KEY for `make deploy` to source. Makes no AWS calls.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="${ROOT}/server"
BUILD_DIR="${SERVER_BUILD_DIR:-${ROOT}/.build/server}"
STAGING="${BUILD_DIR}/staging"

# Must match the template's `Runtime: python3.12` and `Architectures: [arm64]`.
# Wheels are resolved for that platform regardless of this build machine's.
PYTHON_VERSION="${SERVER_PYTHON_VERSION:-3.12}"
PYTHON_PLATFORM="${SERVER_PYTHON_PLATFORM:-aarch64-manylinux_2_28}"

# Packages pulled in transitively that no request path in this server imports,
# and which together are most of the artifact. Lambda's hard ceiling is 250 MB
# *unzipped* across the function and its layers, and unlike AgentCore's 750 MB
# there is no headroom to be relaxed about. Set SERVER_PRUNE=0 to keep them and
# see the raw size. See docs/serverless-deploy-infra.md ("Artifact size").
PRUNE_DEFAULT=1
PRUNE="${SERVER_PRUNE:-${PRUNE_DEFAULT}}"
PRUNE_DIRS=(sympy PIL pillow.libs mpmath)

log() { printf '\033[1m==>\033[0m %s\n' "$*" >&2; }

command -v uv >/dev/null || { echo "package-server: uv is required" >&2; exit 1; }
command -v zip >/dev/null || { echo "package-server: zip is required" >&2; exit 1; }

rm -rf "${STAGING}"
mkdir -p "${STAGING}" "${BUILD_DIR}"

# 1. Pin the dependency set from the server's lockfile. `--no-dev` drops pytest
#    /ruff/mutmut; no `--extra worker`, so bedrock-agentcore stays out (see the
#    header). `--no-emit-project` leaves `promptatron` itself out: it is pure
#    Python and gets copied in below, so there is no wheel to cross-build.
log "Exporting locked runtime dependencies (no dev, no worker extra)"
uv export \
  --project "${SERVER}" \
  --frozen \
  --no-dev \
  --no-emit-project \
  --no-hashes \
  --format requirements-txt \
  > "${BUILD_DIR}/requirements.txt"

# 2. Install them for the runtime's platform. `--only-binary=:all:` is the
#    safety net: a source distribution would be built for *this* machine's
#    architecture and fail at import inside the arm64 runtime, so the build
#    fails loudly here instead of at 3am in a cold start.
log "Installing wheels for ${PYTHON_PLATFORM} (py${PYTHON_VERSION})"
uv pip install \
  --python-platform "${PYTHON_PLATFORM}" \
  --python-version "${PYTHON_VERSION}" \
  --target "${STAGING}" \
  --only-binary=:all: \
  --no-installer-metadata \
  --requirement "${BUILD_DIR}/requirements.txt"

# 3. The application itself, unchanged.
log "Staging the promptatron package"
cp -R "${SERVER}/promptatron" "${STAGING}/promptatron"

# 4. The bootstrap. Lambda's Handler names this file; /opt/bootstrap (the
#    adapter layer's exec wrapper) runs it, and the adapter then proxies to
#    whatever is listening on $PORT.
#
#    - PATH picks up console scripts vendored into the zip (uvicorn, etc.),
#      though `-m` means we do not depend on them.
#    - $LAMBDA_TASK_ROOT is already on sys.path, but naming it keeps the
#      script correct if the adapter ever execs from another cwd.
#    - `exec` matters: the adapter's process tree expects uvicorn to *be* the
#      handler process, not a child of a shell that would swallow signals.
log "Writing the run.sh bootstrap"
cat > "${STAGING}/run.sh" <<'SH'
#!/bin/bash
# Lambda Web Adapter bootstrap -- generated by scripts/package-server.sh.
#
# Named by the function's `Handler: run.sh` and exec'd by the adapter layer's
# /opt/bootstrap wrapper. Everything real lives in promptatron.main; edit the
# package, not this. `python3` (not `python`) because every Lambda Python
# runtime ships it under that name.
set -euo pipefail

PATH="${PATH}:${LAMBDA_TASK_ROOT}/bin" \
PYTHONPATH="${PYTHONPATH:-}:${LAMBDA_TASK_ROOT}:/opt/python:${LAMBDA_RUNTIME_DIR:-}" \
  exec python3 -m uvicorn \
    --host 127.0.0.1 \
    --port "${AWS_LWA_PORT:-${PORT:-8080}}" \
    promptatron.main:app
SH
chmod 0755 "${STAGING}/run.sh"

# 5. Strip build noise so the hash reflects source, not incidental state.
log "Pruning build noise"
find "${STAGING}" -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find "${STAGING}" -type f -name '*.pyc' -delete
find "${STAGING}" -type d -name 'tests' -mindepth 2 -prune -exec rm -rf {} + 2>/dev/null || true
# uv drops a `.lock` in --target directories; it is build-machine state, not code.
rm -f "${STAGING}/.lock"

if [ "${PRUNE}" != "0" ]; then
  for dir in "${PRUNE_DIRS[@]}"; do
    if [ -e "${STAGING}/${dir}" ]; then
      log "  dropping ${dir} ($(du -sh "${STAGING}/${dir}" | cut -f1)) -- unused by any request path"
      rm -rf "${STAGING:?}/${dir}"
    fi
  done
fi

UNZIPPED_KB="$(du -sk "${STAGING}" | cut -f1)"

# 6. Zip deterministically enough that an unchanged tree hashes the same:
#    sorted entries, no extra attributes, timestamps normalised. `-X` drops
#    extra file attributes but KEEPS the unix permission bits, which is what
#    makes run.sh executable on the other side.
log "Zipping"
STAGED_ZIP="${BUILD_DIR}/server.zip"
rm -f "${STAGED_ZIP}"
find "${STAGING}" -exec touch -t 198001010000 {} + 2>/dev/null || true
( cd "${STAGING}" && find . -type f -o -type l | LC_ALL=C sort | zip -qX "${STAGED_ZIP}" -@ )

ARTIFACT_SHA="$(sha256sum "${STAGED_ZIP}" | cut -c1-16)"
ARTIFACT_KEY="server/${ARTIFACT_SHA}.zip"
ARTIFACT_ZIP="${BUILD_DIR}/${ARTIFACT_SHA}.zip"
mv -f "${STAGED_ZIP}" "${ARTIFACT_ZIP}"

cat > "${BUILD_DIR}/artifact.env" <<ENV
ARTIFACT_ZIP=${ARTIFACT_ZIP}
ARTIFACT_SHA=${ARTIFACT_SHA}
ARTIFACT_KEY=${ARTIFACT_KEY}
ENV

log "Artifact: ${ARTIFACT_ZIP} ($(du -h "${ARTIFACT_ZIP}" | cut -f1) zipped, $((UNZIPPED_KB / 1024)) MB unzipped)"
log "S3 key:   ${ARTIFACT_KEY}"

# Lambda's ceiling is 250 MB unzipped across the function and every layer it
# attaches. Fail loudly here rather than at deploy time.
if [ "${UNZIPPED_KB}" -gt 245760 ]; then
  echo "package-server: unzipped size $((UNZIPPED_KB / 1024)) MB is at/over Lambda's 250 MB limit." >&2
  echo "                Prune further (see PRUNE_DIRS in this script) before deploying." >&2
  exit 1
fi
