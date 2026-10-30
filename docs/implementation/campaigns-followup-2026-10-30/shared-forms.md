# Shared forms follow-up: CMP-019 / 020 / 026 / 028 / 030

This report supersedes the corresponding earlier limitations in `../shared-forms-fidelity-2026-10-30.md`. Work is bounded to shared Schedule/Audience forms, their pure models/routes, and audience/scheduling portions of the store. Other agents' changes were preserved. No browser, server, build, commit, branch change, or external Braze mutation was performed by this worker. Root performs browser verification and the final build.

Read installed Next.js `use-client.md`, `route.md`, and `after.md` before implementation. Followed the ongoing dispatching-parallel-agents workflow without spawning additional workers.

## Per-finding result

| Finding | Original audit gap addressed | Evidence / behavior | Separate limitations |
| --- | --- | --- | --- |
| CMP-019 | Dedicated Intelligent Timing settings, popular/custom fallback, quiet hours, preview channel and prerequisites | Preview POST computes actual per-user UTC bins from the same audience eligibility, profile optimal hour, configured fallback and zoned scheduling used by queued delivery. Popular fallback derives from actual recorded session activity converted to each profile zone, then the existing best-hour distribution; insufficient data shows the default explicitly. Quiet-hour resumption uses the exact local end minute. Future Start Date and Target Users prerequisites remain visible. | No remote Braze predictive training. Imported `best_send_hour` and actual local activity determine this local preview. No prediction is fabricated. |
| CMP-020 | All 22 ordinary-channel trigger entries, exact source names/groups and selection flow | Source `source-email-trigger-options.ax.txt` supplies the full catalog. Searchable custom combobox has uppercase groups, 300px width/scrolling height, keyboard arrows/Home/End/Enter/Escape/Tab, outside dismissal and viewport placement. New candidate starts empty; Add Trigger remains disabled until selected. Legacy saved labels still resolve to runtime aliases. The distinct IAM nine-entry catalog is unchanged. | Canonical recorded-event dispatch is supported; provider, location and profile-specific event producers must record the corresponding event. Merely selecting a trigger does not manufacture an event. |
| CMP-026 | Exact 16 category / 6 other-entry hierarchy and captured nested menus, editable/reorderable groups | Main category descriptions and 28 saved submenu/branch captures are compared directly to source AX in tests. Back arrow, nested navigation, leaf search, source descriptions/icons, 400px overlay, available-height placement and outside dismissal are implemented. Enabled fields use actual SQLite SQL shared by estimate/lookup/dispatch. Common profile fields, age, phone, session count/date/duration, specific-app sessions, recent-session windows, subscription membership, eCommerce order/refund/revenue, Campaign receipts/variants/control/conversion, aliases, and actual feature evaluations are supported. | Missing profile/integration data is visibly disabled, with a reason. Cohort/predictive/geographic-radius/Canvas-variation/survey and unsupported advanced retargeting instrumentations are present in the catalog but cannot execute until implemented or connected. Catalog presence is verified; these unavailable capabilities are not represented as working. |
| CMP-028 | Optimize with BrazeAI entry, two-variant prerequisite and Compose shortcut | Source one-variant state is matched: disabled switch, exact prerequisite text and Compose messages shortcut. Server capabilities determine availability. Existing saved optimization intent is preserved with an explicit manual-allocation notice and clear-to-manual action. Manual percentages continue to persist and execute. | Workspace has no BrazeAI optimization provider; the switch stays unavailable after prerequisites rather than accepting an inert enabled flag. This is distinct from the audit's missing-entry finding. |
| CMP-030 | Actual exact-user count, percentage/time/refresh, queue, breakdown and expandable LTV | SQLite requests record Queued → Running → Completed / Failed / Cancelled transitions, work leases, timestamps, actual counts/results and history. POST responds before Next `after` executes actual work; subsequent requests observe persisted state. Queue/history is shared within the campaign workspace. Refresh creates real new work; unchanged criteria reuse completed calculations. Cancel and expired-worker failure are real. Audience-only sanitized snapshots omit message bodies and credentials. | No remote Braze queue connection. Work resumes on subsequent queue requests after process restart; interrupted leases fail visibly. Unknown ETA/LTV displays —; multiple-currency LTV is not falsely combined. |

## New files and APIs

- `app/ui/campaign-intelligent-preview.tsx`: actual delivery preview and per-channel selector.
- `app/ui/campaign-trigger-picker.tsx`: custom accessible grouped trigger combobox.
- `lib/campaign-filter-catalog.ts`: verified static source labels/descriptions and explicit field/capability metadata.
- `lib/campaign-audience-model.ts`: shared DTOs, sanitized snapshots/signatures, field kinds/labels, source prerequisites and capability state.
- `lib/campaign-audience-queue.ts`: server-persisted queue lifecycle.
- `app/api/campaigns/audience-calculations/route.ts`: GET by `id` or queue/history by `campaignId`/`workspaceId`; POST `{campaign,force?}`; POST `{action:'cancel',id}`.
- `app/api/campaigns/form-capabilities/route.ts`: GET `?workspaceId=local`; safe field/resource metadata and actual availability.
- `app/api/campaigns/delivery-preview/route.ts`: POST `{campaign,channel}` returns actual `DeliveryTimePreview`.
- `tests/campaign-audience-queue.test.mjs`: isolated SQLite/API/queue/preview/catalog-runtime integration tests.

Updated `campaign-schedule.tsx`, `campaign-audience.tsx`, dedicated `campaign-forms.module.css`, `campaign-form-model.ts`, `campaign-scheduling.ts`, `campaign-validation.ts`, bounded portions of `braze-store.ts`, and existing form-model tests. Dashboard, Standards/Monitoring/Operator and channel production handlers remain with their owners.

## Export signatures for integration

`lib/campaign-audience-model.ts`:

- `audienceCalculationSnapshot(draft: MessageDraft): MessageDraft`
- `audienceCalculationSignature(draft: MessageDraft): string`
- `intelligentTimingRequirements(draft: MessageDraft, at = new Date()): string[]`
- `brazeAIAvailability(variantCount, capability?): {enabled,reason}`
- `campaignAudienceFieldKind(field): 'date'|'number'|'boolean'|'text'`
- `campaignAudienceFieldLabel(field, capabilities?): string`
- DTOs `AudienceStatistics`, `AudienceCalculation`, `DeliveryTimePreview`, `CampaignFormCapabilities`; `campaignChannelNames`.

`lib/campaign-audience-queue.ts`:

- `enqueueAudienceCalculation(draft, {force?} = {}): AudienceCalculation`
- `listAudienceCalculations({campaignId?,workspaceId?} = {}): {queue,history,workspaceId}`
- `getAudienceCalculation(id): AudienceCalculation`
- `cancelAudienceCalculation(id): AudienceCalculation`
- `processAudienceCalculationQueue(limit = 10): Promise<AudienceCalculation[]>`

`lib/braze-store.ts`:

- `calculateCampaignAudienceStatistics(campaign): AudienceStatistics`
- `campaignFormCapabilities(workspaceId = 'local')`
- `intelligentTimingFallback(campaign): {time,source:'custom'|'activity'|'profile'|'default'}`
- `previewCampaignDeliveryTimes(campaign, channel = campaign.channel, at = new Date()): DeliveryTimePreview`

`lib/campaign-scheduling.ts`: `nextAllowedDeliveryTime(at, delivery, zone = 'UTC'): Date`.

Existing exports and legacy persisted drafts remain compatible. Root added generic resource mutation/read guards for the private calculation resource type; use dedicated APIs.

## Runtime data contracts

Session duration median uses only recorded numeric nonnegative `properties.session_duration_seconds`, `properties.duration_seconds`, or `properties.duration_ms` converted to seconds. Absent measurements stay unknown. Specific-app sessions read recorded `properties.appId` / `app_id`. Recent-session windows support 1–30 days. Order/refund totals use actual `ecommerce.order_placed` / `ecommerce.order_refunded` events and recorded amount fields. Campaign receipt queries ignore test/simulated flags at both top level and external-event attributes. Numeric and boolean comparisons normalize SQLite scalar formatting correctly. Feature status reuses the existing flag evaluator and active Campaign assignments.

## Verification

Node 22.22.3 with `--experimental-transform-types`: **49 focused tests passed**, across `campaign-audience-queue`, `campaign-form-model`, `campaign-backend`, and `campaign-progress`. Source parity tests compare actual saved AX labels/descriptions instead of duplicating the catalog as expected constants. Integration tests use isolated temporary SQLite databases and disable external delivery; only Next's response lifecycle is mocked in the HTTP queue test, while actual storage/calculation executes.

Final `tsc --noEmit --incremental false`: **passed**. No full build run by this worker. Root's browser visual verification is the remaining shared integration check.
