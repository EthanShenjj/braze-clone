# Shared Campaign form and backend fidelity implementation

Implemented against `docs/audits/campaigns-fidelity-2026-10-29/findings.json` and the associated current-run DOM/JPG captures. Read Next.js 16 installed `use-client.md` and `route.md` before editing. Existing dirty work was retained. No commits, branch changes, browser sessions, servers, or builds were started by this worker.

For the completed follow-up on CMP-019/020/026/028/030, see [shared forms follow-up](campaigns-followup-2026-10-30/shared-forms.md). Its verified source catalogs, server queue, preview, and capability details supersede the earlier limitations below.

## Findings

| Finding | Implementation |
| --- | --- |
| CMP-017 | Delivery type radio cards with descriptions; Timing radio rows and help link; dedicated form styling. |
| CMP-018 | `resolveCampaignTiming` is shared by form/scheduler/summary; absent timing means immediate, conditional date/frequency fields remain hidden. Root integrates the helper into Review. |
| CMP-019 | Dedicated Intelligent Timing fallback radio settings, custom time, quiet hours, future-date/target preview prerequisites, actual fallback summary. Scheduler consumes profile `best_send_hour`, user time zone and saved fallback. Predictive model training and population-derived popular-time computation are unavailable locally; the UI says so. |
| CMP-020 | Grouped 22-entry trigger catalog; canonical recorded-event mapping and property filtering affect actual action dispatch. Existing four trigger types are preserved. Provider/profile/geofence event production requires an integration and is explicitly described. The virtualized source capture enumerates only the first five labels while reporting 22 total; exact label parity for the other entries cannot be certified from that capture alone. |
| CMP-021 | Schedule Delay mode/value/unit; canonical persisted minutes; campaign start/date/company time zone/optional end; summary. Actual action enqueue uses the same zone-aware duration helper. |
| CMP-022 | Stable public campaign UUID, Copy, and executable local trigger API/cURL example using actual internal campaign URL and `campaigns.trigger` authorization. |
| CMP-023 | Re-eligibility value/unit selectors persist both editable units and the engine's day value. |
| CMP-024 | Actual frequency policy state, rules and guarded navigation to the existing frequency management workspace. |
| CMP-025 | Searchable multi-select segments with selected chips and real saved segment data; AND/OR remains persisted. |
| CMP-026 | All 16 source category headings and 6 other entries, category navigation/search, named groups, OR/AND, drag and keyboard reorder. Real SQL supports profile/segment/event/session/purchase/receipt fields. Categories requiring unavailable cohort, uninstall, prediction, social, attribution, random-bucket or deletion data remain explicitly unavailable rather than silently matching all users. |
| CMP-027 | Independent modal with Escape, focus trap/restore, submission/loading/result/error; exact internal ID/email and external_id/external_user_id/braze_id lookup aliases supported. |
| CMP-028 | Optimize with BrazeAI prerequisite state, persisted intent, manual allocation and Compose shortcut. Automatic predictive traffic allocation requires an unavailable external service; manual allocations remain in effect and this is visible. |
| CMP-029 | Independent suppression list block, actual entries/empty state and management navigation. |
| CMP-030 | Exact audience calculation with percent/time/refresh, channel breakdown, additional statistics and actual LTV (single currency), local live calculation queue and persisted request history. Remote Braze queues are not connected. Root can reuse exported statistics component on Review. |
| CMP-031 | Nine source conversion types grouped under General Activity/eCommerce. Legacy purchase/email types survive existing drafts without being added as new source options. Actual attribution matches canonical names. |
| CMP-032 | `resolveConversionEvents` preserves old `conversion: Make Purchase` as `Makes Purchase` consistently; new drafts default to Start Session. Root integrates into Review. |
| CMP-033 | Narrow fields, event descriptions, app scope, deadline explanation and calculated deadline summary. |
| CMP-034 | Root-owned Review Agentic Standards; this worker did not edit its layout. |

## Files owned

- `app/ui/campaign-schedule.tsx`, `campaign-audience.tsx`, `campaign-conversions.tsx`
- New dedicated `app/ui/campaign-forms.module.css`
- New `lib/campaign-form-model.ts`
- `lib/campaign-scheduling.ts`: normalized defaults, event aliases, intelligent fallback, validation, duration
- `lib/campaign-shared.ts`: optional persisted audience group name only
- Backend integration wave: `lib/braze-store.ts`, `lib/campaign-validation.ts`, subscription group collection/detail API routes, generic resource collection route
- New tests `tests/campaign-form-model.test.mjs` and `tests/campaign-backend.test.mjs`

## Public interfaces

`lib/campaign-form-model.ts` exports:

- `resolveCampaignTiming(draft): 'now' | 'designated' | 'intelligent'`
- `resolveConversionEvents(draft): CampaignConversion[]` (preserves legacy event/app/deadline data)
- `conversionConfigurationIssues(draft): string[]`
- `conversionCatalog`, `campaignTriggerCatalog`, `triggerEventName(type)`
- `audienceFilterCatalog`, `otherAudienceFilters`
- `campaignScheduleSummary(draft): string`
- `delayMinutes(value, unit)`, `reentryDays(value, unit)`

`lib/campaign-scheduling.ts` additionally exports `isWithinCampaignDuration(campaign, at = new Date()): boolean`. Start is inclusive, end is exclusive; datetime-local end values use the configured company time zone.

`app/ui/campaign-audience.tsx` exports `CampaignAudienceStatistics({draft})` and `WorkspacePolicySummary({section?: 'all'|'frequency'|'suppression'})`. The default audience component accepts optional `onCompose?: () => void`.

Backend exports:

- `listCampaigns({q?, status?, limit?, offset?, sort?, includeArchived?, workspaceId?})`; default workspace is `local`, default excludes archives; `status:'Archived'` includes archives
- `getCampaign(id)` includes archived records; stale saves cannot restore them
- `listCampaignWorkspaces(): {id,name,current}[]`
- `copyCampaignToWorkspace(id, targetWorkspaceId): CampaignRecord`; local SQLite workspaces only, copies independent Draft with new internal/public IDs, preserves tags
- `getCampaignAnalytics(id, {from?:'YYYY-MM-DD', to?:'YYYY-MM-DD'} = {})`: actual campaign/events/changes/audience/monitor object or null when missing. Dates are inclusive UTC days, maximum 366 days.
- `getCampaignMonitoring(id): CampaignMonitoring`
- `saveCampaignMonitoring(id, input: unknown): CampaignMonitoring`
- `evaluateCampaignMonitoring(id, at: Date | string = new Date()): CampaignMonitoring`
- `validateSubscriptionCapabilities(input): {sms,mms,rcs}`
- `managedWebhookCredentialMetadata(record)` returns whitelisted metadata

Monitoring uses numeric minute durations from the analytics model, nonnegative integer thresholds and notification channels `Email`/`Webhook`. Breaches persist actual local `campaign-monitor-alerts` resources, deduplicated per criterion/time window, with `notificationStatus:'recorded_locally'`; no external notifications are claimed.

`config.apiIdentifier` is a stable public UUID: valid UUID supplied on first create is honored, otherwise random; legacy IDs map deterministically; subsequent changes cannot replace it. `createdAt`, `createdBy`, `lastEditedBy`, and `workspaceId` persist with local defaults. Campaign audits contain redacted before/after snapshots.

Subscription group capabilities use a `subscription-group-capabilities` resource sidecar, preserving the seven-column table and seed inserts. Default is SMS true/MMS false/RCS false. Create/update APIs validate complete boolean objects. Every chosen SMS/MMS/RCS variant is checked against the selected group before launch or test.

Dynamic audience SQL identifiers are `id`, `created_at`, `session_count`, `event_count:<name>`, `purchase_count`, `purchase_total`, `campaign_interaction:opened|clicked`, `segment:<name>`, `emailSubscriptionStatus`, and `attr:<name>`, alongside the previous fields. Both preview and dispatch reuse the same SQL. LTV is unknown when no purchase data exists or currencies differ.

Conversion attribution processes actual tracked profile events and external email interaction receipts against prior real campaign exposures, checks app/property filters and deadline, and deduplicates by exposure plus conversion index. Receipts include `conversionIndex`, source/entry IDs and variant attribution. Simulations and test exposures do not create production conversions.

Canonical Feature Flag experiments validate 2–8 weighted variants and properties. Launch chooses from treatment percentages, merges selected properties into saved Flag properties, records variant attribution, and leaves the shared Flag resource unchanged.

Managed Webhook credentials store only `credentialEnv`, `scheme: Bearer|Basic|Header`, and optional `headerName`. Server delivery resolves active references, rejects unavailable credentials, replaces the relevant request header, and scrubs raw/encoded secrets from transport echoes, persisted attempts, history and test responses. Resource API responses whitelist metadata and reject inline secret fields. Credential resolution tests use a mocked transport; no external requests are sent by those tests.

## Verification

Using `/Users/ethanshen/.nvm/versions/node/v22.22.3/bin/node`:

- 14 new form/scheduler/validation tests pass.
- 14 existing campaign channel parity tests pass.
- 11 new isolated SQLite integration tests pass, covering IDs/archives/workspaces, transport capabilities, real audience SQL/lookup/LTV, conversion attribution, redacted history, actual local monitoring, server credential resolution/redaction weighted Feature Flag assignments, actual action duration/SQL enqueue, and capability API validation.
- Full `tsc --noEmit --incremental false` passed before root added new API routes. Latest integration check only needs regenerated Next route types for root-owned new RouteContext paths; final check is recorded by root.

Feature/API editors skip ordinary scheduling validation for hidden legacy delivery settings.

No full build was started. Browser visual and interaction checks are root-owned; model/backend verification does not claim screenshot parity.

## Follow-up review: badges and embedded test snapshots

Root requested an additional review of `lib/campaign-progress.ts` and multichannel test snapshots. Fixed confirmed issues:

- Compose now uses reusable `campaignComposeIssues`, recursively isolating channel content from later-step state, including obsolete embedded child schedules/audiences/conversions/allocations. Explicitly empty secondary email subject/body is validated.
- `campaignAudienceIssues` aligns badges, launch validation and audience SQL for invalid number/date/boolean filter values, segment operators and nonpositive audience/rate limits.
- Feature/API schedule badges ignore hidden legacy delivery fields. IAM schema-v2 schedule validation remains in the Schedule badge.
- Multichannel parent conversion validation is no longer skipped by an early return. Actual multichannel execution uses shared parent delivery/conversions/holdout, normalizes old child allocation ratios, and checks selected-group capabilities before any channel dispatch. Source embedded configurations are preserved.
- `sendTestCampaign` requires snapshot ID equality, validates selected saved parent-channel membership, rejects aggregate dispatch without a selected child, rejects stale variant IDs, and validates only the selected channel composition. Unsaved edits to a selected child are tested without mutating its parent. Newly added channels must be saved in the parent before their first test; root added this save flow.
- Push and Content Card tests use the same channel compilers as launch. Standalone WhatsApp test preparation enforces the same parent membership restriction.

Added `tests/campaign-progress.test.mjs` and expanded isolated backend tests. Final focused verification: **49/49 passing** (14 form/scheduler tests, 14 preexisting channel parity tests, 14 isolated backend tests, 7 progress tests). Metadata availability such as deleted custom segments, archived subscription groups or disconnected providers still requires the actual backend/API result; pure badges do not claim to certify external service availability.
