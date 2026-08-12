# Deployed server + SPA — infrastructure notes

Companion to [`serverless-deploy.md`](./serverless-deploy.md), which is the
normative contract between the server-side work and this. That document says
*what* the deployed shape is; this one covers **how it is packaged and wired,
where each fact came from, and what about it only a real deploy can prove.**

Everything here concerns `scripts/package-server.sh`, the `ServerFunction` /
`AppBucket` / `AppDistribution` half of `api/template.yaml`, and `make deploy`.

## Where the facts came from

Same two-tier split as [`cloud-evals-infra.md`](./cloud-evals-infra.md),
because the sources do not deserve equal confidence.

**Read directly, as source** — the strongest evidence available without an AWS
account:

- [`aws/aws-lambda-web-adapter` README](https://github.com/aws/aws-lambda-web-adapter)
  (fetched raw from `main`) — the layer ARNs, the full configuration
  environment-variable table with defaults, and the zip-package setup. Note the
  repository moved from `awslabs/` to `aws/`; both paths still resolve.
- [`examples/fastapi-response-streaming-zip/template.yaml`](https://github.com/aws/aws-lambda-web-adapter/blob/main/examples/fastapi-response-streaming-zip/template.yaml)
  and its
  [`app/run.sh`](https://github.com/aws/aws-lambda-web-adapter/blob/main/examples/fastapi-response-streaming-zip/app/run.sh)
  — an AWS-maintained SAM template doing exactly this: FastAPI, zip package,
  `Handler: run.sh`, adapter layer, `AuthType: NONE` + `InvokeMode:
  RESPONSE_STREAM`. This is what makes the shape a fact rather than a hope.
- `/workspace/readysetcloud/rsc-core/template.yaml` — a working CloudFront
  distribution in front of a non-S3 origin, and the source of the two managed
  policy ids used below.
- This repository's own source (`server/promptatron/**`, `app/src/api/http.ts`)
  for every claim about what the application does.

**Second-hand, from AWS documentation via search** — `docs.aws.amazon.com` is
blocked by this environment's egress proxy, so these were read as search
summaries, not fetched pages. Strong hints, not verified:

- [SAM `FunctionUrlConfig`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-functionurlconfig.html)
  — `InvokeMode` is `BUFFERED` (default) or `RESPONSE_STREAM`.
- [Invoking a response streaming enabled function using function URLs](https://docs.aws.amazon.com/lambda/latest/dg/config-rs-invoke-furls.html)
  and [Introducing AWS Lambda response streaming](https://aws.amazon.com/blogs/compute/introducing-aws-lambda-response-streaming/)
  — the payload ceiling and the bandwidth shape.
- [Restrict access to an AWS Lambda function URL origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)
  — CloudFront OAC for Lambda function URLs, and its POST/PUT body-hash
  requirement.

Claims below are tagged **[lwa]**, **[rsc]**, **[repo]**, **[docs]**, or
**[measured]** (something actually run on this branch).

---

## The adapter, and why the application is untouched

`promptatron.main:app` runs on Lambda **unchanged** — no handler function, no
Mangum, no ASGI-to-Lambda shim anywhere in `server/`. The AWS Lambda Web
Adapter layer does the translation out of process:

1. `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap` makes the Lambda runtime exec the
   layer's bootstrap instead of the normal Python runtime **[lwa]**.
2. That bootstrap starts the adapter, which execs the function's `Handler` —
   here `run.sh`, a file at the root of the zip **[lwa]**.
3. `run.sh` starts uvicorn on `$PORT`.
4. The adapter polls the Lambda Runtime API, converts each invocation into an
   ordinary HTTP request against `127.0.0.1:$PORT`, and converts the response
   back.

The environment variables that matter, with the defaults they override
**[lwa]**:

| Variable | Value here | Adapter default |
|---|---|---|
| `AWS_LAMBDA_EXEC_WRAPPER` | `/opt/bootstrap` | — (required for zip packages) |
| `AWS_LWA_INVOKE_MODE` | `response_stream` | `buffered` |
| `PORT` | `8080` | `AWS_LWA_PORT`, then `8080` |
| `AWS_LWA_READINESS_CHECK_PATH` | *(unset)* | `/` |
| `AWS_LWA_READINESS_CHECK_HEALTHY_STATUS` | *(unset)* | `100-499` |

### Readiness is left at the default, on purpose

The obvious move is `AWS_LWA_READINESS_CHECK_PATH=/api/v1/health`. That is the
wrong call here. The default path `/` combined with the default healthy range
`100-499` means "the ASGI app answered at all" — FastAPI returns 404 there
(nothing is mounted at `/`), 404 is inside 100-499, and the adapter proceeds
**[lwa]** **[repo]**. That is exactly the signal wanted, and it costs nothing.

`/api/v1/health`, by contrast, probes the config store over HTTP and every
model provider before returning **[repo]** — making every cold start pay for
two round trips before the first real request is even admitted, and coupling
boot to the reachability of a service the server can perfectly well run
without.

### `run.sh`

Generated by `scripts/package-server.sh` (edit the script, not the artifact):

```bash
#!/bin/bash
set -euo pipefail
PATH="${PATH}:${LAMBDA_TASK_ROOT}/bin" \
PYTHONPATH="${PYTHONPATH:-}:${LAMBDA_TASK_ROOT}:/opt/python:${LAMBDA_RUNTIME_DIR:-}" \
  exec python3 -m uvicorn \
    --host 127.0.0.1 \
    --port "${AWS_LWA_PORT:-${PORT:-8080}}" \
    promptatron.main:app
```

Two deliberate deviations from AWS's example **[lwa]**:

- **`python3`, not `python`.** The example uses `python`; every Lambda Python
  runtime ships `python3` under that exact name, so this removes one thing that
  can differ between runtime images.
- **`--host 127.0.0.1` stated explicitly.** It is uvicorn's default and it is
  what the adapter connects to, but a future uvicorn default change should not
  be able to break the deploy silently.

`exec` is load-bearing: the adapter's process tree expects uvicorn to *be* the
handler process, not a child of a shell that would swallow its signals.

The file must be **executable inside the zip**. The packaging script `chmod
0755`s it and zips with `zip -X`, which drops extra attributes but keeps unix
permission bits — verified on the built artifact **[measured]**:

```
-rwxr-xr-x  3.0 unx      623 t- defN 80-Jan-01 00:00 run.sh
```

### Layer ARN

```
arn:<partition>:lambda:<region>:753240598075:layer:LambdaAdapterLayerArm64:28
```

Account `753240598075` publishes the layer into every commercial region, so the
region is a `!Sub` substitution rather than a lookup table **[lwa]**. It is
still parameterized two ways, because a hardcoded layer ARN is a classic
stale-forever dependency:

- `LambdaAdapterLayerVersion` (default `28`, the current published version
  **[lwa]**) — the knob anyone actually turns.
- `LambdaAdapterLayerArn` (default empty) — a full override for a partition or
  private mirror where that account does not publish. The upstream README notes
  the China partition is not deployed to.

`Arm64`, not `X86`, because the function is arm64 (inherited from the
template's `Globals`) and the artifact's wheels are cross-compiled for
`aarch64-manylinux_2_28`.

---

## Streaming

`AWS_LWA_INVOKE_MODE=response_stream` on the adapter and `InvokeMode:
RESPONSE_STREAM` on the Function URL have to agree; either one alone buffers.
SAM supports `InvokeMode` directly on `FunctionUrlConfig` **[docs]**, and the
AWS-maintained FastAPI example sets exactly this pair **[lwa]**.

Limits worth knowing:

| Limit | Value | Source |
|---|---|---|
| Streaming response payload | 200 MB (soft, raisable; was 20 MB at launch) | **[docs]** |
| Unthrottled prefix | first 6 MB | **[docs]** |
| Bandwidth past 6 MB | ~16 Mbps (2 MB/s) | **[docs]** |
| Function timeout | 900 s (Lambda max) | — |
| CloudFront origin response / inter-packet timeout | 60 s (set explicitly; 30 s default, 60 s max without a quota increase) | **[docs]** |

That last row is the one with teeth. CloudFront's origin response timeout is
also its *inter-packet* timeout on a streaming response, so a run that goes
more than 60 seconds between NDJSON events will have its connection dropped by
CloudFront even though the Lambda is happily still running. `OriginReadTimeout:
60` buys the maximum available without a quota request. If long tool-using runs
turn out to exceed that, the fix is a periodic heartbeat event in the run
stream, not an infrastructure change.

---

## The artifact

`scripts/package-server.sh` is `package-eval-worker.sh`'s sibling and shares
its two hard-won rules: cross-compiled `aarch64-manylinux_2_28` wheels with
`--only-binary=:all:` as a loud failure mode, and a **content-hashed S3 key**
(`server/<sha256[:16]>.zip`). The second is rsc-core's `AgentArtifactKey`
lesson again: CloudFormation only updates a function when a property it can
*see* changes, and for an S3-sourced function that property is the key. Upload
new bytes under a static key and CloudFormation correctly concludes nothing
changed.

Differences from the worker's packaging:

- The root entry is `run.sh`, executable, not a Python module.
- **No `--extra worker`.** `bedrock-agentcore` (with its OpenTelemetry and MCP
  tails) belongs to the AgentCore artifact; this server only ever *invokes* the
  runtime, through boto3.
- Dev dependencies are excluded (`--no-dev`), same as the worker.
- uv's `.lock` marker file is removed from the staging tree — build-machine
  state, not code, and it would otherwise perturb the content hash.

### Artifact size

Lambda's ceiling is **250 MB unzipped**, counted across the function *and*
every layer it attaches — much tighter than AgentCore's 750 MB, with no slack
to be relaxed about. Measured on this branch **[measured]**:

| | zipped | unzipped |
|---|---|---|
| Everything the lockfile resolves | 56 MB | 199 MB |
| After pruning (what ships) | **46 MB** | **157 MB** |

199 MB would have fit, barely, but with ~50 MB of headroom for a stack whose
largest dependency (`botocore`, 28 MB) grows monthly. So four packages are
pruned by default:

| Pruned | Size | Why it is safe |
|---|---|---|
| `sympy` | 19 MB | |
| `pillow.libs` | 16 MB | |
| `PIL` | 7 MB | |
| `mpmath` | 2 MB | (sympy's own dependency) |

All four arrive via `strands-agents-tools`, and the only modules that import
them are `strands_tools/calculator.py`, `strands_tools/image_reader.py` and
`strands_tools/use_computer.py` **[measured]** — none of which any
`promptatron` module imports, directly or dynamically (the package contains no
`importlib.import_module` / `__import__` call at all **[measured]**).
`strands_evals`, which *is* used, does not reference `strands_tools` anywhere
**[measured]**.

The consequence to know about: if a future change wants those three
`strands_tools` modules, they will `ImportError` in Lambda and work fine
locally. Set `SERVER_PRUNE=0` to build unpruned, and re-check the size. The
script hard-fails the build above 240 MB unzipped rather than letting the
deploy discover it.

Uploading from S3 rather than inline also sidesteps the 50 MB direct-upload
limit, which 46 MB is uncomfortably close to.

---

## Environment wiring, and the one thing CloudFormation cannot do

Three of the four discoverable settings are injected straight from the
template, exactly as `serverless-deploy.md` prefers:

| Env var | Value |
|---|---|
| `PROMPTATRON_CONFIG_API_URL` | `!Sub https://${Api}.execute-api.${AWS::Region}.${AWS::URLSuffix}/api` |
| `PROMPTATRON_EVAL_TABLE` | `!Ref ScenariosTable` |
| `PROMPTATRON_EVAL_RUNTIME_ARN` | `!GetAtt EvalWorkerRuntime.AgentRuntimeArn`, or absent when the worker is not deployed |

The fourth, `PROMPTATRON_CONFIG_API_KEY`, **cannot** be: CloudFormation has no
way to read an `AWS::ApiGateway::ApiKey`'s value. There were two honest
options.

**Rejected: a `NoEcho` template parameter**, mirroring
`EvalWorkerConfigApiKey`. It keeps discovery off and the deploy fully
declarative, but it puts the secret in the argv of every deploy (and therefore
in shell history and in the CloudFormation console's parameter list, `NoEcho`
notwithstanding for the CLI half), and it must be re-supplied on every deploy
or it silently reverts to empty. The worker took this route only because it had
no alternative.

**Chosen: keep stack discovery ON for that one field.** `PROMPTATRON_STACK_DISCOVERY`
is `true` and `PROMPTATRON_STACK_NAME` is `!Ref AWS::StackName`, so the server
resolves the key from the stack itself at runtime. This costs exactly two
read-only IAM actions on the function role, both narrowly scoped:

```yaml
- Effect: Allow
  Action: cloudformation:DescribeStacks
  Resource: arn:<partition>:cloudformation:<region>:<account>:stack/<this stack>/*
- Effect: Allow
  Action: apigateway:GET
  Resource: arn:<partition>:apigateway:<region>::/apikeys/*
```

Why this is the cleaner half rather than just the lazier one:

- The mechanism already exists, is cached for the life of the execution
  environment, and is explicitly fail-soft — a permissions problem degrades one
  field and logs one line, it does not break the server **[repo]**.
- The secret never travels through a CLI argument or a template parameter.
- Injecting the other three anyway is not redundant: they are on the hot path
  (DynamoDB history on every request, `InvokeAgentRuntime` on every cloud
  evaluation), and an explicit value keeps them working even if discovery
  fails. Only the config store, which the server can run without, depends on
  discovery succeeding.
- `GET /api/v1/health` reports `config_store.source` as `"stack"`, so the
  behaviour is visible rather than mysterious **[repo]**.

`apigateway:GET` on `/apikeys/*` is the one grant worth a second look: it is
account-wide read on API-key values in the region, because the key's id is not
known at template-authoring time. Narrowing it needs the id, which is only
available after the key exists.

The rest of the environment:

| Env var | Value | Why |
|---|---|---|
| `PROMPTATRON_DB_PATH` | `/tmp/promptatron.db` | `/var/task` is read-only; the run engine opens a SQLite file for scratch even under the DynamoDB history backend |
| `PROMPTATRON_HISTORY_BACKEND` | `dynamodb` | Explicit rather than relying on `auto`'s `AWS_LAMBDA_FUNCTION_NAME` detection |
| `PROMPTATRON_LOCAL_EVALS` | `off` | Same reasoning |
| `PROMPTATRON_AWS_REGION` | `!Ref AWS::Region` | |
| `PROMPTATRON_CORS_ORIGINS` | `[]` (parameter `ServerCorsOrigins`) | See below |

### CORS: the empty list is the correct value

The SPA and the API share one CloudFront origin, so **nothing the browser does
is cross-origin** and no `Access-Control-Allow-Origin` header is needed at all.
An empty list is therefore not a compromise — it is tighter than naming the
CloudFront domain, because it also denies any *other* page that guesses the
Function URL.

Naming the CloudFront domain would additionally have been impossible to express:
the distribution's origin is the Function URL, so a CORS value derived from
`!GetAtt AppDistribution.DomainName` on the function's own environment is a
circular dependency.

`ServerCorsOrigins` exists for the one case that does need it — pointing a
local `vite` at the deployed server — e.g.
`--parameter-overrides 'ServerCorsOrigins=["http://localhost:3000"]'`.

---

## CloudFront: one distribution, two origins

```
                    ┌───────────────────────────────┐
   browser ────────▶│  AppDistribution (CloudFront) │
                    ├───────────────────────────────┤
                    │  default  → S3 (OAC, private) │  SPA
                    │  /api/*   → Lambda Function URL│  FastAPI
                    └───────────────────────────────┘
```

Mechanics, following rsc-core's Function-URL-behind-CloudFront precedent
**[rsc]**:

- **Origin domain.** `!GetAtt ServerFunctionUrl.FunctionUrl` returns
  `https://<id>.lambda-url.<region>.on.aws/`; CloudFront wants the bare host,
  which is `!Select [2, !Split ['/', ...]]`.
- **`CachingDisabled`** (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`) on `/api/*` —
  an NDJSON run stream is never cacheable **[rsc]**.
- **`AllViewerExceptHostHeader`** (`b689b0a8-53d0-40ab-baf2-68738e2966ac`) —
  forwards every viewer header, cookie and query string, while letting
  CloudFront set `Host` to the Function URL's own domain. Lambda rejects a
  request whose `Host` does not match, so the plain `AllViewer` policy would
  break it **[rsc]**.
- **No `OriginPath` rewriting and no `AWS_LWA_REMOVE_BASE_PATH`.** The FastAPI
  routers mount at `/api/v1` **[repo]**, so `/api/*` matches the real paths and
  the origin receives them unchanged. The path prefix is a genuine coincidence
  of design, and a lucky one.
- **`CachingOptimized`** (`658327ea-f89d-4fab-a63d-7e88639e58f6`) on the
  default behaviour. Vite emits content-hashed asset filenames; `index.html` is
  covered by the invalidation `make deploy` issues.

### SPA fallback is a CloudFront Function, not `CustomErrorResponses`

The standard recipe is `CustomErrorResponses: 403/404 → /index.html (200)`.
**Do not use it here.** `CustomErrorResponses` is a distribution-level
property — it is not scoped to a cache behaviour — so it would also rewrite the
API's own 404s (`GET /api/v1/runs/{unknown-id}`) into a 200 carrying the HTML
shell. The app's error layer would see a 200 whose body is not JSON and raise
`invalid_response` instead of surfacing a not-found **[repo]**.

A CloudFront Function *is* per-behaviour. `SpaRouterFunction` is attached to
the default behaviour only, so `/api/*` never touches it:

```js
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var last = uri.substring(uri.lastIndexOf('/') + 1);
  if (last.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
```

Deliberately ES5-only (`indexOf`/`substring`, no `includes`/`endsWith`) so it is
valid under either CloudFront Functions runtime. `/history` and
`/scenarios/abc` rewrite to `/index.html`; `/assets/index-abc123.js` and
`/favicon.ico` pass through untouched.

One consequence: FastAPI's `/docs` and `/openapi.json` are *not* reachable
through CloudFront — they are not under `/api/*`, so they hit the SPA origin
and get the app shell. Use the `ServerFunctionUrl` output directly for those.

### The SPA's API base URL

`app/src/api/http.ts` needed **no change**. Its `baseUrl()` treats a blank
`VITE_API_URL` as unset and falls back to `http://localhost:8000`, but it
strips trailing slashes before use — so **`VITE_API_URL="/"` resolves to an
empty base**, and `apiUrl()` emits relative paths like `/api/v1/runs`
**[measured]**:

| `VITE_API_URL` | `apiUrl('/runs')` |
|---|---|
| *(unset)* | `http://localhost:8000/api/v1/runs` |
| `""` | `http://localhost:8000/api/v1/runs` ← **not** what you want |
| `"/"` | `/api/v1/runs` ✅ |
| `"/api/v1"` | `/api/v1/runs` ✅ |
| `"https://d123.cloudfront.net"` | `https://d123.cloudfront.net/api/v1/runs` |

`make deploy` therefore builds with `VITE_API_URL=/` (the `DEPLOY_API_URL`
variable). Both `http.ts` and `stream.ts` route through `apiUrl()`, so this
covers the entire API surface including the NDJSON streams **[repo]**.

---

## Auth: what is and is not protected in v1

Stated plainly, because it is the thing most likely to be misremembered.

**Not protected.** The Lambda Function URL is `AuthType: NONE`. Anyone who
learns the URL can call the API directly: run models on your Bedrock account,
read and delete run history, create and delete guardrails. There is no login,
no API key, no IP restriction, no WAF. The only thing standing between the
internet and the API is that the URL is a random 32-character subdomain that is
not published anywhere. **This is a personal deployment posture, and it is a bad
fit for anything with real data or a real bill.**

The CloudFront distribution does not change that: it is a second, *also*
unauthenticated front door onto the same function, not a gate in front of the
first.

**Why not `AWS_IAM` + CloudFront OAC**, which is the obvious hardening?
CloudFront supports origin access control for Lambda function URLs, and it
would make the function reachable only through the distribution. But with OAC,
requests carrying a body require the **viewer** to compute the SHA-256 of the
request body and send it in `x-amz-content-sha256` — Lambda does not accept
unsigned payloads **[docs]**. A browser cannot do that. Since this application
POSTs to start every run and every evaluation, OAC would break the app's
primary path. It is viable only for SigV4-signing non-browser clients.

`ServerFunctionUrlAuthType` is parameterized to `AWS_IAM` for that case and
documented as not being a drop-in.

**Realistic hardening paths, in increasing order of work:** a CloudFront
Function checking a shared secret header on `/api/*` (weak but cheap, and
keeps browsers working); CloudFront + WAF with an IP allow-list; Cognito with
a hosted UI and a Lambda@Edge/CloudFront Function verifier — which is the
Multi-user auth item `serverless-deploy.md` puts out of scope.

### IAM added, exactly

Beyond `AWSLambdaBasicExecutionRole` (logs) and the X-Ray write access SAM adds
for `Tracing: Active`:

| Actions | Resource |
|---|---|
| `bedrock:InvokeModel`, `InvokeModelWithResponseStream`, `Converse`, `ConverseStream` | `foundation-model/*`, `inference-profile/*` |
| `bedrock:ListFoundationModels`, `ListInferenceProfiles` | `*` (neither is resource-scopable) |
| `bedrock:ApplyGuardrail`, `CreateGuardrail`, `CreateGuardrailVersion`, `GetGuardrail`, `UpdateGuardrail`, `DeleteGuardrail` | `guardrail/*` |
| `bedrock:ListGuardrails` | `*` |
| `dynamodb:Query`, `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem` | the config-store table |
| `dynamodb:Query` | that table's `GSI1` |
| `bedrock-agentcore:InvokeAgentRuntime` | the eval worker runtime (only when it is deployed) |
| `cloudformation:DescribeStacks` | this stack only |
| `apigateway:GET` | `/apikeys/*` in this region |

Two differences from the worker's role are worth noting. The server **does**
get `Query` (listing runs and evaluations walks the `GSI1` `RUN`/`EVAL`
partitions) and `DeleteItem` (`DELETE /runs/{id}` is a real endpoint), where
the worker deliberately has neither. And guardrails here are full CRUD, not
just `ApplyGuardrail`.

---

## Deploying

```
make deploy
```

is the whole flow, and it is **idempotent**:

1. Resolve the artifact bucket from the stack's `ArtifactBucket` output,
   bootstrapping the stack with a plain `sam deploy` if it does not exist yet.
2. `scripts/package-server.sh` → `server/<sha>.zip`, uploaded.
3. Read the stack's **current** `EvalWorkerArtifactKey` and pass it back
   unchanged alongside `ServerArtifactKey`.
4. `sam build && sam deploy`.
5. Seed the table from `api/seed/fixtures/**`.
6. `npm ci && VITE_API_URL=/ npm run build` in `app/`.
7. `aws s3 sync app/dist s3://<AppBucket> --delete`.
8. `aws cloudfront create-invalidation --paths '/*'`.
9. Print the `AppUrl`.

`make package-server` builds the artifact alone and makes no AWS calls.

### The same sharp edge, now in both directions

`EvalWorkerArtifactKey` and `ServerArtifactKey` are both plain CloudFormation
parameters with empty defaults, and an empty value deletes the corresponding
resources. So:

| Target | Preserves worker? | Preserves server? |
|---|---|---|
| `make deploy-api` | ✅ (reads it back) | ❌ **deletes the server** |
| `make deploy-worker` | ✅ (sets it) | ❌ **deletes the server** |
| `make deploy` | ✅ (reads it back) | ✅ (sets it) |

**Once the server is deployed, `make deploy` is the target to use.** It is a
superset of `deploy-api` and coexists with `deploy-worker` only in the
worker→server direction. Extending `deploy-api`/`deploy-worker` to read back
`ServerArtifactKey` too would fix the asymmetry but changes targets this work
item does not own; the mitigation for now is this table, the parameter's own
comment in `api/template.yaml`, and the Makefile comment.

---

## Open risks — unverified without a deploy

This branch has no AWS account. Everything below is reasoned or read, not
observed.

**Packaging and boot**

- **`Handler: run.sh` + `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`.** Copied from
  an AWS-maintained example **[lwa]**, but that example is x86 and does not use
  a package (`promptatron.main:app` vs `main:app`). The import of a *package*
  from `$LAMBDA_TASK_ROOT` rather than a top-level module is the one untested
  step.
- **The `python3` substitution.** Near-certain, but it is a deviation from the
  working example.
- **`manylinux_2_28` floor.** Inherited from the worker's build, where greenlet
  forced it. Lambda's `python3.12` runtime is Amazon Linux 2023 (glibc 2.34), so
  it should hold; `SERVER_PYTHON_PLATFORM` is the escape hatch.
- **Cold start, unmeasured.** Importing strands + boto3 + FastAPI + SQLModel
  before uvicorn can answer the readiness probe is not fast, and the adapter
  waits for it. `ServerMemorySize` (default 1024) is the knob; consider 2048 if
  the first request after a deploy is painful. `AWS_LWA_ASYNC_INIT=true` is the
  adapter's own answer to this **[lwa]** and is not set — it changes init
  semantics and should be tried against a real cold start, not guessed at.

**Streaming through CloudFront**

- **That NDJSON actually stays incremental end to end.** Each hop is documented
  to stream (uvicorn → adapter with `response_stream` → Function URL with
  `RESPONSE_STREAM` → CloudFront), but "no hop buffers the whole body" is
  precisely what only a real run proves. If it turns out CloudFront buffers,
  the fallback is pointing the SPA at the Function URL directly and accepting
  CORS.
- **The 60 s inter-packet timeout.** Whether real runs ever go a full minute
  between events is unknown.

**CloudFront and CFN mechanics**

- **`!Select [2, !Split ['/', !GetAtt ServerFunctionUrl.FunctionUrl]]`.** The
  implicit `<Function>Url` logical id is how AWS's own example reads the URL
  back **[lwa]**; the string surgery is straightforward but unverified against
  a real `FunctionUrl` value.
- **OAC + `S3OriginConfig: {OriginAccessIdentity: ''}`.** The documented
  pairing, but the empty-string-alongside-OAC form is easy to get subtly wrong.
- **The bucket-policy / distribution ordering.** `AppBucketPolicy` references
  the distribution and the distribution references the bucket's domain name;
  CloudFormation should order this fine (the policy is not an input to the
  distribution), but a first-create failure here would be unsurprising.
- **`sam validate` passes and `sam build` preserves the S3 `CodeUri`
  unchanged** — both actually run on this branch **[measured]** — but neither
  proves the stack converges.
