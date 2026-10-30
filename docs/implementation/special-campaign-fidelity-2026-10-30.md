# API Campaign / Feature Flag Experiment fidelity — 2026-10-30

Implemented CMP-071–074 in new editor components and pure helpers. Read saved source DOM and JPG screenshots 33/34, shared conversion/scheduling helpers, the actual flag property/evaluation contract in `lib/workspace-modules.ts`, and repository Next.js guidance. No dashboard/store/global CSS edits were made by this worker. No live campaign was activated by this worker.

## Integration

Named exports from `app/ui/special-campaign-editors.tsx`:

```
<ApiCampaignEditor campaign={draft} locale={locale}
  onSave={saveDraftPatch} onClose={closeEditor} notify={notify} />
<FeatureExperimentEditor campaign={draft} locale={locale}
  onSave={saveDraftPatch} onClose={closeEditor} notify={notify} />
```

`campaign` is a generic MessageDraft with required id/name. `locale` is optional (default en); `onSave` accepts a partial MessageDraft and resolves a success boolean; onClose and optional notify are ordinary callbacks. Root integrates early returns before the ordinary five-step campaign shell. Editors preserve unrelated config and show save/network errors. Unsaved drafts have an in-product save/discard/keep-editing dialog.

Both use root's real `CampaignBrief` upload component, actual TagPicker and team picker. Campaign brief data uses metadata references, not embedded file base64. Active feature assignment configuration is read only; editing never writes a feature-flag resource.

## Findings

| Finding | Implemented | Boundary / limits |
| --- | --- | --- |
| CMP-071 | API Campaign is its own single-page configuration: Details, API Campaigns, channels/identifiers, suppression, conversion events, Additional Options/frequency capping. No ordinary Compose/Schedule/Audience wizard and no in-editor Record Event simulation. | Actual external event receipts remain available through the supported API. |
| CMP-072 | Nine channel types: Email, Android Push, iOS Push, Kindle Push, Web Push, Content Card, SMS, Webhook, WhatsApp. Channel tabs/add menu; stable campaign UUID and per-channel variation UUIDs; copy fields, selectable variation reference JSON/cURL, re-eligibility units, rate limit and workspace policy summaries. | Source captured selected Email but did not capture the expanded channel menu. Legacy external variation IDs are preserved to avoid breaking references; newly generated IDs use UUIDs. No local /messages/send endpoint exists. Source-style external Braze reference requests are clearly marked and require channel content/credentials. A second cURL example matches the actual local receipt route. No send is executed by the editor. |
| CMP-073 | Feature experiment uses exactly four steps: Experiment Basics / Target Audience / Assign Conversions / Review Summary, matching bottom Basics/Target/Assign/Review shortcuts. Validation determines step states; visiting a step does not mark it complete. | There is no separate Schedule Delivery step. Backend worker removed hidden legacy delivery validation for feature/API. |
| CMP-074 | Experiment Composer has variant tabs/add/remove/name/percentage controls, Experiment Setup, actual feature-flag fetch and source empty-state warning/link. Selected flag properties and status are read only; variant JSON property overrides use the actual workspace object/10k contract. Review shows merged assignments and validation. An incomplete draft with no flag can be saved; starting requires complete valid configuration. | Source account had no flags, so the expanded selected-flag/property editor branch was not captured. Working local controls are implemented without claiming exact proprietary UI parity. Flag global rollout must be zero before activation and is never changed by the editor. |

## Persisted contracts and behavior

API:

- `config.apiIdentifier`: immutable public campaign UUID, generated or retained by backend.
- `config.apiMessageVariations`: `[{id,channel,name,...preservedMetadata}]`.
- `config.delivery`: reeligible/reentryValue/reentryUnit/reentryDays.
- `config.rateLimitEnabled`, `config.rateLimit`; conversion config and unrelated legacy settings remain intact.
- The supported local receipt example is POST `/api/campaigns/:internalId/events` with `{userId,event:'delivered',attributes:{variantId,channel}}`, intended for a sending system to report an actual confirmed outcome.
- Re-eligibility/rate settings are persisted policy metadata for an external sender; receipt recording does not itself send or enforce a send schedule. There is no fake local messages/send gateway.

Feature:

- Canonical `config.featureExperiment = {flagId,variants:[{id,name,percentage,properties}],...preservedFields}`.
- Compatibility mirrors: subject=flagId; body=first variant properties JSON; config.messageVariants; config.variantSplits; config.channelValues.rollout=100.
- Canonical variant percentages total 100% of treatment. Root variantSplits mirror absolute population weights after the separately configured config.controlGroup; shared Target Audience edits convert back to treatment percentages.
- Property JSON must be an object no larger than 10,000 serialized characters. Malformed property drafts remain visible and block saving rather than silently replacing saved values.
- Source default one variant is retained as an incomplete draft; activation requires two to eight variants, unique IDs/names, valid percentages and available flag, matching backend validation.
- Review activation first saves, then POSTs the existing `/api/campaigns/:id/launch` route; success is reported only when the backend confirms Active. Backend worker implemented weighted chosen-variant assignments and merges overrides with existing flag properties without mutating the flag. The implementation itself did not call this route.

## Verification

New files:

- `app/ui/special-campaign-editors.tsx`
- `app/ui/special-campaign-editors.module.css`
- `lib/special-campaign-model.ts`
- `tests/special-campaign-model.test.mjs`
- This report.

12 focused tests passed with Node 22.22.3:

```
node --experimental-transform-types --test tests/special-campaign-model.test.mjs
```

Tests cover the nine-channel catalog, UUID generation/stability/legacy references, real receipt and reference JSON schemas, zero-minute re-entry and invalid API limits, legacy single/multiple feature migration with preserved IDs/properties/treatment ratios, incomplete draft vs readiness, real property constraints, available/archived/global-rollout flag validation, control-group/treatment mirrors, roundtrip preservation and flag immutability.

`tsc --noEmit --incremental false --pretty false` was run. Special-editor files produced no diagnostics after the model/import fixes. The repository check was temporarily blocked by root's newly added routes awaiting generated RouteContext types, root's in-progress campaign-operator import, and an unrelated dashboard map-on-string edit. Root owns final type generation/full integration checks. No browser or pixel comparison was performed by this worker.

After root type generation/integration fixes, the full `tsc --noEmit --incremental false --pretty false` check passed. The special-editor targeted suite now has 12 passing tests including multi-variant legacy migration.
