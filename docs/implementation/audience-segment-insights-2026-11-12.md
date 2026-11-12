# Segment Insights comparison — 2026-11-12

Source URL was the actual link captured in the Segment editor. A dedicated inspection tab visited that URL, then switched to Live – ittor through the workspace menu. Evidence is saved as `source-insights-02-baseline`, `source-insights-03-columns`, `source-insights-error`, and `source-insights-live-error` in the Audience full audit directory.

Verified controls: Segment Insights heading and estimate note; searchable Baseline selector defaulting to All Users; searchable Segments multi-selector with maximum 10; Columns menu with All Columns and seven default selected fields; sortable metric headers. The visible label “Days since first purchase” uses the source DOM identifier `days_to_first_purchase`, so the implementation maps it to the existing time-to-first-purchase metric.

Implemented: scoped live comparisons from the shared audience evaluator, All Users or saved-segment baseline, up to ten saved segments, the seven source columns, column visibility and sorting, URL-persisted selectors/options, actual recorded currencies, unknown metric placeholders, and links back to saved segment editors. The Segment editor links to this report with its saved segment preselected. Baseline-relative percentage changes are calculated from actual values; no percentage is shown when the baseline is zero or unknown or currencies differ.

The source report consistently failed with “An unexpected error occurred” after the selection/data load in both Demo and Live workspaces, including one Demo reload. Loaded metric rows, the full comparison-selection menu, and row interactions therefore remain source-unverified. The local table body and relative-change presentation are functional implementations based on the recorded controls, not a verified row-level visual match. No source creation, save, archive, or deletion action was performed during Insights inspection.

Tests: `tests/segment-insights-model.test.mjs` and `tests/segment-insights-api.test.mjs` verify source field mappings, selection limits, unknown-safe sorting, recorded-currency formatting, zero-baseline behavior, actual session/purchase metrics, baseline selection, workspace isolation, and API limits.

Separate earlier Segments inspection incident: Create with Operator automatically created an unnamed source segment without a subsequent Save action. That incident predates this Insights inspection and is recorded in `audience-segments-2026-11-12.md`; the no-write statement above applies specifically to this Insights task.
