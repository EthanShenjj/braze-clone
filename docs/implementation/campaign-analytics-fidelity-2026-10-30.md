# Active campaign analytics fidelity — 2026-10-30

Implemented new UI and pure metric helpers for CMP-076–079 using saved Braze evidence 36 (analytics/performance/history), 38 (changes), and 39 (monitoring), including both DOM snapshots and JPG screenshots. No server, browser session, source mutation, provider delivery, or full build was performed by this worker.

## Integration

Default export `CampaignAnalytics` from `app/ui/campaign-analytics.tsx`:

```
<CampaignAnalytics
  campaign={campaign}
  onEdit={() => openCampaignEditor(campaign)}
  onRefresh={() => refreshCampaignList()}
  notify={showNotification}
/>
```

Required campaign fields are `id`, `name`, `channel`. Optional fields are `status`, `schedule`, `sent`, `edited`, `body`, `subject`, `config`, `audience`, `conversion`, `createdAt`. Root integrates the Active campaign entry and provides the API route. No dashboard/store/root-list code was changed by this worker.

GET `/api/campaigns/:id/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` accepts a direct response or `{data: response}`:

- `campaign`: optional refreshed campaign record.
- `events`: `{id,user_id,event_type,created_at,data}` with parsed stored JSON data. Tracking metadata may be directly in data or nested in data.attributes.
- `changes`: `{id,createdAt,user,category,action,before,after}`.
- `audience`: `{matching,reachable,total,ltv?,lifetimeValue?,channelBreakdown?:[{channel,reachable,ltv?}],breakdown?}`.
- `monitor`: `{lowerEnabled,lowerDuration,lowerThreshold,upperEnabled,upperDuration,upperThreshold,channels,localOnly?,evaluatedAt?,alerts?}`.

POST the same endpoint with `{action:'monitor', ...settings}`. Durations are numeric minutes: 1/5/15/30/60/180/360/720/1440. Client validates enabled criteria, nonnegative whole thresholds, supported durations/channels, and lower < upper for equal durations. Backend worker owns authoritative validation/persistence and local evaluation. Saved monitoring is refetched and errors remain visible. The UI explicitly states that this saves local monitoring preferences and does not send external Email/Webhook notifications.

## Findings

| Finding | Implemented behavior | Evidence limits |
| --- | --- | --- |
| CMP-076 | Source-style analytics tabs/date range, unique recipients/conversion/current audience cards, created/edited data, delivery/audience/conversion summaries, source-style Edit campaign action, audience details/LTV, API identifier copy. | Root must integrate Active entry. Unknown creator/date/LTV remain unavailable rather than fabricated. Funnel/Retention and conversion correlation are truthfully gated because no supported analysis backend exists. |
| CMP-077 | Actual per-variant metrics, allocation percentages, selectable columns, real click-target details and CSV, saved variant native preview, historical SVG lines with message/campaign and variant/statistic filters, accessible data table and CSV, conversion event details. | Metric counts derive only from actual production events. Source Highcharts internals are not recreated; generic click history is used because button-specific receipts are not guaranteed. Existing tracked target/alias data is available in click details. |
| CMP-078 | Changes modal with category/user filters, timestamp/user/category/action/before/after columns, sorted records, source empty state. Changes-since-viewed counts persist per campaign in localStorage. | No invented audit history; available Before/After comes from API. |
| CMP-079 | Source-style Campaign Monitoring modal with lower/upper checkbox criteria, durations/thresholds, Email/Webhook channels, validation, persisted POST, visible errors and local evaluation information. | Original duration option catalog was not captured. Local supported minutes are agreed with backend worker. No external notification delivery is claimed. |

## Metrics and data correctness

`lib/campaign-analytics-model.ts` is pure and shared by the UI. It deduplicates identical event IDs, excludes test/simulated/filtered/bot events and does not count `accepted`, `prepared`, or SDK `available` as delivered. Unique recipients use recorded `sent`/`delivered`/impression users; impressions use delivered/impression receipts. Unique conversions use attributed conversion events and their 0-based conversionIndex. A missing denominator displays an em dash rather than an invented rate. Repeated real events retain their event counts; unique counts deduplicate user IDs.

Events whose variant is missing or retired remain visible as an Unattributed row; they are not assigned to a guessed variant. Currency totals stay separate. Historical bins use UTC calendar days, preserve zero-event days, and limit ranges to an inclusive 366 days. CSV values quote commas/newlines/quotes and neutralize spreadsheet formulas. Native message preview uses the actual saved variant and an empty profile, with no invented preview recipient.

The component uses `resolveConversionEvents` and `campaignScheduleSummary` so summaries use the same configuration semantics as the compose flow. API identifiers prefer config.publicId/config.publicUuid, falling back to the actual campaign id; root may adapt this to its public identifier key during integration.

## Files and verification

New files only:

- `app/ui/campaign-analytics.tsx`
- `app/ui/campaign-analytics.module.css`
- `lib/campaign-analytics-model.ts`
- `tests/campaign-analytics.test.mjs`
- This implementation report.

11 file-based tests passed with Node 22.22.3:

```
node --experimental-transform-types --test tests/campaign-analytics.test.mjs
```

Coverage: test/simulation/bot/acceptance exclusion; repeated event vs unique users; duplicate event IDs; conversion indices/currencies; configured variant allocations and unattributed receipts; leap dates and invalid ranges; UTC history and range/variant filtering; click alias grouping; audit filter intersections; monitor validation; safe CSV export. TypeScript passed using `tsc --noEmit --incremental false --pretty false`. The initial incremental TypeScript write and first attempt to create the test artifact hit ENOSPC; no files were deleted by this worker, and persistence succeeded once workspace storage recovered.

Browser screenshot comparison remains for root's integrated verification; no claim of pixel-identical rendering is made.
