# Canvas Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the behavior and layout gaps in the approved Canvas recheck report, using the observed Braze interface and official runtime semantics as the contract.

**Architecture:** Keep Next.js, React and the existing SQLite-backed domain store. Extract deterministic scheduling, event matching and preview/evaluation logic into focused modules; the central store remains the transaction boundary. Provider-dependent execution must use configured connectors, preserve truthful delivery states, and fail with a configuration requirement when absent.

**Tech Stack:** Next.js 16.3.5, React 19, TypeScript, Node 22, node:sqlite; existing delivery adapters and Node tests.

**Spec:** `docs/audits/canvas-recheck-2026-11-12/report.md`, source/production screenshot and AX pairs in that directory, plus `docs/implementation/canvas-deep-2026-11-12.md` for previously observed deep states. User approved continued implementation of this scope.

## Global Constraints

- Preserve existing working features, workspace isolation, frequency capping, subscriptions and suppression checks.
- Read the applicable Next.js guide before editing route or component behavior.
- External effects are disabled in tests; never test by sending to real users or starting source Braze Canvases.
- Use failing behavioral tests for new runtime contracts; verify layout in CUA against a 1280×720 viewport.
- Do not replace a disabled control with a fabricated success, conversion, delivery, Agent response or Standards result.
- The user selected a persistent-disk server with SQLite and confirmed no target server is available. Complete and verify the self-hosted package; external deployment awaits that resource.
- Workers own separate files, do not revert other changes, and do not commit until integration and verification are complete.

## Review Focus

- Two concurrent workers must not enroll or deliver the same user twice; assert dispatch/run idempotency.
- A user or resource in another workspace must never enter, receive, or influence a conversion; test foreign identifiers.
- Delay/action-window expiry and DST/month-end schedules must advance at the documented instant; use literal UTC expectations.
- Test Canvas must preview timing and side effects without mutating real user profiles or sending unless explicitly requested.
- Missing connectors and rejected providers must leave an actionable failure and release quota, rather than a delivered event.

### Task 1: Correct channel editors and form fidelity

**Files:** `app/ui/canvas-channel-editor.tsx`, `app/ui/campaign-message-editor.tsx`, supporting SMS composer integration; `app/ui/canvas-wizard.module.css`. Root integrates `canvas-wizard.tsx` dirty/summary behavior.

**Interfaces:** Preserve existing CanvasChannelEditor and onDone payloads. SMS selection must produce the SMS composer and subscription-group semantics, never the LINE fallback. Variant test previews must use the selected variant.

- [x] Reproduce the wrong SMS composer with a failing actual-render or browser test; add a regression protecting the consumer-visible editor and saved SMS draft.
- [x] Reuse the existing SMS composer; preserve Optimizer tabs, settings, variants, delivery validations and unsaved protection.
- [x] Align Basics input width (437px at 1280px), fixed footer and clean/dirty Save behavior with source evidence; keep narrow viewports usable.
- [x] Verify SMS/Email/Push switching, selected-variant preview and refresh protection with a disposable draft.

### Task 2: Deterministic runtime models

**Files:** create `lib/canvas-runtime-model.ts`, `tests/canvas-runtime-model.test.mjs`; update only the model files explicitly coordinated with root.

**Interfaces:** export `CanvasRuntimeEvent`, `canvasTriggerMatches(trigger,event,context?)`, `canvasNextEntryAt(entry,after,timezone?)`, `canvasAssignedVariant(canvasId,userId,variants)` and Action Paths decision helpers. Reuse existing CanvasStepTrigger, CanvasWizardConfig and CanvasVariant types. Document exact signatures in the module and notify root before integration.

- [x] Add failing tests for custom/message/subscription/profile/purchase events, property predicates, first-event and ranked-window routing.
- [x] Add failing schedule tests for one-off/daily/weekly/monthly, month-end and local DST, and stable weighted variant assignment.
- [x] Implement the pure contracts and verify literal outcomes without mocking the code under test.

### Task 3: Test Canvas and Standards evaluation

**Files:** `app/ui/canvas-build-toolbar.tsx`, `app/ui/canvas-standards.tsx`, new preview/evaluation UI, `lib/canvas-preview.ts`, `lib/canvas-evaluation.ts`, new `/api/canvases/[id]/test` and `/evaluation` routes and their tests. Root owns braze-store exports and parent props.

**Interfaces:** Test request `{workspaceId,userId,at?,eventInputs?,sendMessages?:boolean,recipients?:Record<string,string>}` returns ordered steps with arrival times, eligibility, routing and compiled previews. Sending requires explicit true and a recipient for every message channel. Root provides `sendCanvasTestMessages(canvasId,preview,recipients)` and `previewCanvasConditionsOnProfile(canvasId,userId,config,profile)`; preview types are owned by the preview worker. Evaluation request `{workspaceId,standardIds}` returns stored per-step findings and run status, using actual configured Standard rules/connector. Any unavailable semantic service must return its real configuration requirement.

- [x] Add failing preview tests proving profile updates are simulated, timing is advanced, Liquid is evaluated and real profiles/sends remain untouched.
- [x] Implement test-user selection and results, with dynamic availability instead of permanent disabled controls.
- [x] Add failing evaluation tests for real rule findings, pass/fail statuses and foreign Standards; implement results and selection/error/empty states.
- [x] Wire toolbar and step results to these endpoints, preserving the source empty states when no Standard exists.

### Task 4: Integrate persistent execution (root)

**Files:** `lib/braze-store.ts`, `lib/canvas-model.ts`, `lib/canvas-wizard-model.ts`, `lib/canvas-step-model.ts`, `app/api/canvases`, event/worker APIs, root-owned CanvasWizard/LiveCanvas integration, runtime HTTP tests.

- [x] Write failing integration cases: >100 candidates/>10 entrants; scheduled/action/API entry; Action Paths wait/rank; weighted variants; conversion attribution; retry/idempotency and workspace isolation.
- [x] Remove demo caps and unconditional unsupported guards only as corresponding execution is implemented.
- [x] Persist scheduled subscriptions, action windows, entry/variant assignments and conversions; route existing user/message events into the Canvas processor.
- [x] Add configured Agent, audience connector, destination Canvas and Feature Flag execution with scoped resources, explicit outcomes and cycle/retry guards.
- [x] Select Optimizer components using recorded outcomes; enforce configured generation service requirements rather than inventing content.
- [x] Persist Winning Path start/exposure/conversion data, wait for its configured window, evaluate actual rates and published pairwise Pearson significance, freeze a deterministic winner with the configured fallback, and route subsequent users to it.
- [x] Dispatch non-SMS messages through existing channel adapters/SDK materialization; preserve prepared/accepted/delivered semantics and frequency reservations.
- [x] Expose the worker/trigger APIs and a production scheduler process appropriate to the selected hosting topology.

### Task 5: Production storage, overview and final acceptance (root)

**Files:** `next.config.ts`, server deployment/worker configuration, CanvasWorkspace/Wizard/LiveCanvas and integration tests.

- [x] Act on the user's hosting choice; disable forced browser-only creation when a durable server path is available. Preserve import/export recovery for existing browser drafts.
- [x] Complete Changes Since Last Viewed, rate-limit state, conversion deadlines, selected-variant editing and history interactions using real stored data.
- [x] Verify all implemented model tests, full project tests, TypeScript and production build.
- [ ] Refresh source-state comparison after source login is restored; captured 2026-11-12 evidence is retained.
- [x] Repeat disposable-database API acceptance and CUA source/local comparisons. Record unresolved external configuration or unverified states explicitly.
- [x] Review the complete diff and commit/push the validated implementation under the authorized workflow.
- [ ] Deploy externally when the persistent-disk server is provided.

## Builder review rulings

- Shared store, existing shared models, CanvasWizard and LiveCanvas are root-owned. Runtime worker owns only its new pure module and test. Preview worker owns new APIs and optional toolbar/Standards props. Editor worker owns channel editor/composer and Wizard CSS.
- Agent connector: `CANVAS_AGENT_ENDPOINT` / `CANVAS_AGENT_API_KEY`; audience connector: `CANVAS_AUDIENCE_SYNC_ENDPOINT` / `CANVAS_AUDIENCE_SYNC_API_KEY`; semantic evaluator: `CANVAS_STANDARDS_ENDPOINT` / `CANVAS_STANDARDS_API_KEY`. Require HTTPS except loopback test/development; include workspace/resource/job identity and idempotency key. Missing, invalid, refused and timed-out connectors return explicit outcomes, never fabricated output.
- Message dispatch reuses existing adapter credentials. Provider accepted is distinct from delivered. New real-service contracts are verified with controlled connectors; absence of actual provider credentials remains an explicitly unverified production connection.
- Preview defaults to no mutation/no send; actual test-send mode is implemented with explicit recipients. Winning Path is a separate evaluation contract from weighted variants and content optimization.

## Final integration status — 2026-11-13

Tasks 1–4 and the self-hosted package are implemented. The root integrated typed exception controls, SDK exit guards, real conversion facts, actual SDK test materialization, scoped linked resources and Pearson significance. Full tests: 702/702 with no skips; TypeScript and production build pass. The clean-database 125-user HTTP acceptance passed with the production Web and independent worker running together; final health is green. True-process regression covers profile ingestion and exactly-once Delay completion. Implementation and evidence are ready for the authorized Git submission. External deployment is pending the user-provided persistent-disk server. See `docs/implementation/canvas-parity-2026-11-13.md` for evidence and exact limitations.
