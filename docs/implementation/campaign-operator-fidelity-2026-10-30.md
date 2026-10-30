# Campaign Operator fidelity — 2026-10-30

CMP-075 is implemented as an independent right-hand conversation panel. Root integrates the Create with Operator entry and retires its old generator from that entry; existing operator-channel records remain untouched.

## Files and integration

- app/ui/campaign-operator.tsx and campaign-operator.module.css: default CampaignOperator with props `{close:()=>void, createDraft:(plan:OperatorPlan)=>Promise<boolean>}`.
- lib/campaign-operator-model.ts: exported OperatorPlan, strict plan validation, provider response parsing, bounded safe history context and dependency-injected endpoint handler.
- app/api/campaign-operator/route.ts: actual configured AI transport, stored histories and server-side brief resolution.
- tests/campaign-operator.test.mjs: model and endpoint behavior tests.

Root should mount the panel with a workspace key and supply its real draft-persistence callback. OperatorPlan uses exact labels from multichannelChannels, messages keyed by the corresponding channel IDs, goal, optional audience and supported schedule, and optional canonical brief metadata. Root must force Draft status, retain attached brief metadata, and map the channel-specific messages/configuration into its Multichannel draft. Operator never launches or sends campaigns.

## Source fidelity

Inspected the captured source JPG and first 24 DOM lines of 35-braze-operator-entry-result: BrazeAI Operator heading, New badge, Clear chat history, Maximize, Close, Goal/Channel(s)/Audience/Timing introductory prompts, Ask a follow-up, Add context and Auto-approve actions. The panel uses the source right-side dimensions, input area and switch structure. Conversation history is also available from actual saved records. Expanded mode widens the same panel. No new operator campaign is created simply by opening the panel.

After an actual AI response, a reviewable plan lists goal, channels, audience/timing intent and each channel's content/configuration. Create draft calls the supplied persistence callback. Auto-approve performs only this draft creation after a validated response; its limitation is explicit beside the switch. Failure preserves the request for correction/retry and does not display a generated-plan success state.

## Real transport and persistence

GET /api/campaign-operator returns provider capability and conversation histories scoped by the workspace query. POST sends a request to the configured WORKSPACE_AI_ENDPOINT with the configured server key/model and returns a validated structured plan. Unconfigured or non-HTTPS connections return explicit 503 capability errors. Provider failures, malformed JSON, unsupported channels, mismatched messages, excessive sizes or executable top-level fields cannot be persisted as valid generated plans. No tool/campaign-send/launch operations exist in this endpoint.

Conversations persist as campaign-operator-history resources. Follow-up context accepts only bounded user/assistant turns; injected system/tool roles are discarded. Updates pass the stored resource revision to avoid overwriting another tab's conversation. Clear chat history deletes the current persisted conversation. Saved histories can be reopened, and cross-workspace conversation IDs are rejected.

The attachment control reuses CampaignBrief and its actual upload endpoint. Brief IDs resolve to campaign-briefs resources server-side; model-invented attachment references are discarded. TXT/MD/CSV content is sent as text, capped at 100,000 characters with an explicit truncation notice. PDF and DOCX files are attached and retained, but this workspace does not extract their binary contents for the configured text transport; the panel tells users to add key requirements in chat. Download references retain the original file. Uploaded brief metadata is returned on the plan for draft preservation.

## Verification and limits

Node 22.22.3 with --experimental-transform-types: Operator tests pass 13/13; combined Operator/list tests pass 24/24. Coverage includes configured and unavailable AI, invalid channels/actions/config, code-fenced response validation, real prompt/brief transport, absent briefs, explicit binary limitations, workspace isolation, persisted history clearing and revision preservation. No live AI request or campaign delivery was performed by tests.

TypeScript reports no errors in the Operator files. The current whole-project check still reports root's stale generated RouteContext paths and dashboard.tsx:830 string.map typing; these are outside this ownership. Root must complete integration and browser verification. No browser, server, full build, commit or branch changes were run for this task.

The source audit captured the initial Operator panel, not a successful deep AI response. The local review-plan presentation, exact generation quality and provider behavior therefore remain unverified against an original generated response. This implementation does not claim that unobserved behavior is source-identical.
