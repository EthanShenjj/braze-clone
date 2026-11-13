# Canvas journey previews and Standards evaluation

The dedicated endpoints read saved Canvas configuration. A toolbar save callback runs before either dialog opens. Step evaluations use the saved step; edits inside an open message editor must be saved first.

## Test Canvas

`GET /api/canvases/:id/test?workspaceId=...&q=...` returns same-workspace test users and stored test runs. User search applies workspace filtering before its limit.

`POST /api/canvases/:id/test` accepts:

```json
{
  "workspaceId": "local",
  "userId": "user_1",
  "at": "2026-11-12T00:00:00Z",
  "eventInputs": [
    {"kind":"custom","name":"checkout","at":"2026-11-12T00:30:00Z","properties":{"total":50}}
  ],
  "messageVariants": {"email_step":"email_variant_2"},
  "sendMessages": false
}
```

The response is `{runId,preview,deliveries}`. `preview.steps` is ordered and includes arrival/departure times, eligibility reasons, selected routes, compiled subject/body, per-message profile/context snapshots, simulated profile changes, and blocked-service explanations. The pure preview never writes a profile or calls a delivery provider. A test user continues through the preview when entry conditions do not match, and continues after ineligible messages. Cycles and components requiring an unavailable execution service stop with a blocked result.

Events use `CanvasRuntimeEvent` from `lib/canvas-runtime-model.ts`. The API fills omitted user/workspace identifiers and rejects foreign identifiers. A maximum of 200 events is accepted. Action Path windows and weighted variants use the same deterministic runtime helpers as execution. `messageVariants` is optional and validated against message variants in this Canvas.

Actual test sends require both `sendMessages: true` and explicit `recipients` keyed by message channel, for example `{"email":"you@example.test","sms":"+15551234567"}`. Only eligible messages on the previewed path are submitted to `sendCanvasTestMessages`. Its returned outcomes are stored and displayed as returned; an unconfigured/disabled provider does not become a delivered outcome. Recorded runs use the protected `canvas-test-runs` resource type.

## Standards rules

Standards are actual, nonarchived `campaign-standards` resources in the Canvas workspace. Local structural Standards have `data.rules`:

```json
{
  "workspaceId": "local",
  "rules": [
    {"id":"subject","type":"required","field":"subject","nodeKinds":["message"],"channels":["email"]},
    {"id":"short-body","type":"max_length","field":"message","value":160,"nodeKinds":["message"],"channels":["sms"],"message":"Shorten the SMS body."}
  ]
}
```

Each rule has `id`, `type`, and `field`. `field` is a safe dotted path in the saved node configuration, such as `subject`, `message`, or `channelValues.url`. Prototype keys are rejected. Optional `nodeKinds` and `channels` restrict the steps checked; optional `message` customizes a failing finding.

| Rule type | `value` | Exact check |
| --- | --- | --- |
| `required` | Omitted | Field exists and its string form is nonblank |
| `max_length` | Nonnegative integer | String length is at most `value` |
| `contains` | String | Case-sensitive literal substring exists |
| `forbidden_text` | String | Case-sensitive literal substring is absent |
| `equals` | String | String form equals `value` |
| `one_of` | Nonempty string array | String form is in the allowed array |
| `https_url` | Omitted | Field parses as HTTPS URL without user/password |

These checks describe configuration rules. They do not infer meaning, tone, factual accuracy, or brand compliance. The exported `canvasStandardRuleSchema` is the JSON Schema for individual rules and is also returned by the evaluation GET endpoint.

## Semantic evaluation connector

A semantic Standard uses `data.instructions` (or `prompt` / `criteria`) and optionally `data.mode: "semantic"`. Without structural rules, the Standard description can supply the instructions. Structural rule descriptions alone do not enable semantic evaluation. A Standard can combine executable local rules with explicit semantic instructions.

The server configures `CANVAS_STANDARDS_ENDPOINT` as an HTTPS URL, optional `CANVAS_STANDARDS_API_KEY` as the Bearer token, and optional `CANVAS_STANDARDS_TIMEOUT_MS` (100–30,000 ms; default 10,000). Endpoints are read from server configuration, never arbitrary Standard data. Redirects are rejected.

The service receives a POST body `{canvasId,workspaceId,standard:{id,name,instructions},steps:[{nodeId,label,kind,config}]}`. It must return exactly one finding for every supplied step:

```json
{"findings":[{"nodeId":"email_step","status":"failed","message":"Add the offer expiration date."}]}
```

Only `passed` and `failed` are accepted service statuses. Unknown/missing/duplicate steps, malformed output, non-2xx responses, and timeouts become `error`. An absent or non-HTTPS endpoint produces `configuration_required`. No local keyword match substitutes for a semantic service result.

`POST /api/canvases/:id/evaluation` accepts `{workspaceId,standardIds,nodeId?}`. `nodeId` restricts evaluation to that saved step. Runs and findings are persisted as protected `canvas-evaluations` resources; `GET` returns scoped history and supports `nodeId` filtering. A completed UI evaluation emits `canvas-evaluation-updated` with `{canvasId,workspaceId,run}` for parent views to refresh.

## Verification

Dedicated tests cover profile immutability, literal UTC delays, simulated-profile routing, message-time profile snapshots, matching Action Path event properties, variant selection, scoped content blocks, real rule findings, foreign IDs, connector failures/timeouts, recorded runs, explicit send consent, and prepared rather than fabricated delivered outcomes. Browser/source comparison is coordinated by the root agent.
