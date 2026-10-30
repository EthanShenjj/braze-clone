# Campaign list fidelity — 2026-10-30

The independent CampaignList component is implemented in app/ui/campaign-list.tsx with campaign-list.module.css. It uses the shared pure helpers in lib/campaign-management-model.ts and shared campaign-fidelity.module.css. AGENTS.md, bundled Next use-client/native History API guidance and source DOM/JPG evidence were read before implementation. The existing dashboard list is left untouched for root integration.

## Findings addressed

- CMP-001: source-sized page heading, access badge, feedback/tour/create actions, toolbar, chips, results, table, row heights, status/channel badges and horizontal table overflow. Root owns the global navigation rail, channel menu artwork and topbar.
- CMP-002: All, Active, Draft, Archived, Stopped and Idle statuses.
- CMP-003: Campaign type, creator, last editor, entry schedule, date-created/edited ranges, expired interaction data, complexity threshold, BrazeAI optimization and target-segment controls. Filtering reads actual campaign metadata and segments from the resource API. Complexity has no fabricated threshold: an explicit exceeded flag or saved threshold must be available.
- CMP-004: all eight optional source columns with All Columns and individual native checkboxes, persisted in the existing localStorage key. Name/Status remain permanent.
- CMP-005: semantic buttons and aria-sort for Name, Stop date, Sent, Teams and Last edited, using the corresponding values.
- CMP-006: search submits explicitly; each active filter has an individual removable chip. Query state preserves workspace/locale and integrates with browser history.
- CMP-007: 12/24/48/96 rows and numbered pagination with first/last, adjacent pages and ellipses.
- CMP-008: Copy to workspace opens the source two-step modal. Destination options come from real available workspaces; source workspace is excluded using campaign.config.workspaceId, with local as legacy fallback. The copy uses the supplied persisted backend route and refreshes after success.
- CMP-009: bulk Archive invokes the real onArchive callback, reports failures and retains unsuccessful selections for retry. Tag as uses the existing TagPicker and POST /api/tags/campaigns.
- CMP-010–011: Priority Sorter entry opens the existing accessible priority manager. That component already supports optional id and counted collapsible buckets, bulk selection/moves, row links, drag/up/down actions and server viewOnly.
- CMP-012: Create campaign forwards the real event to root. Root owns the create menu and must constrain its fixed placement/height to the viewport; this component does not reimplement that menu.

Row names call onEdit(campaign, false), allowing root to open Active Campaign Analytics. The Edit row action calls onEdit(campaign, true). Archive/Duplicate/Stop remain actual provided operations. Feedback is persisted to /api/resources/campaign-feedback; no toast-only storage claim is made. Popovers close with outside click/Escape, menus support arrow navigation, and dialogs trap focus and restore it on close.

## Integration contract

Default export CampaignList<T extends CampaignListItem> accepts locale, campaigns, onEdit, onCreate, onStop, onArchive, onDuplicate, onRefresh, onTour and notify exactly as requested. onArchive returns Promise<boolean>; onDuplicate/onRefresh return Promise<void>. Callbacks should reject on operational failure. Root should replace its private list with this import, keep fetching all campaigns for the selected workspace, and scope analytics/edit/create to the selected workspace.

The component fetches GET /api/campaign-workspaces and POST /api/campaigns/:id/copy with {workspaceId}. Source account permissions are represented by actual available destinations; an empty or failed workspace list has an explicit state. No new workspace is invented. User names and teams come from stored campaign metadata. Shared backend routes/store remain owned by root/shared_forms.

## Verification

Node 22.22.3 with --experimental-transform-types: tests/campaign-list-fidelity.test.mjs passes 11/11 tests covering catalogs, legacy URL compatibility, invalid pagination, workspace-preserving serialization, compound filters, actual actor/schedule/segment metadata, show-only flags, date boundaries, all sortable values, team/stop-date presentation and bounded numbered pagination.

TypeScript reported no errors in the component/styles/model. The latest whole-project check is currently blocked by stale generated AppRouteHandlerRoutes for root-added campaign-briefs/[id], campaigns/[id]/analytics and campaigns/[id]/copy routes. Root must regenerate Next route types or complete its route integration before claiming a fully clean project check. No browser, server, full build, commit or branch changes were run by this agent for this task.
