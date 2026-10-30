# Channel fidelity — 2026-10-30

Implemented CMP-011 and CMP-046–068 across the owned channel editors and models. Read AGENTS.md and bundled Next use-client documentation before editing. Inspected source DOM and key Banner, priority sorter, LINE and WhatsApp JPGs.

## Changes

- CMP-011: counted collapsible priority buckets, selection, bulk moves, drag ordering, up/down actions, message links and server-provided viewOnly support.
- CMP-046–048: simultaneous push previews; language/Liquid tools; separate iOS and Android advanced settings persisted into compiled platform payloads with validation.
- CMP-049–051: independent IAM Android/iOS button actions, separately saved Light/Dark styles, runtime platform/theme selection, dark-style validation and stacked traditional Accessibility/KVP settings.
- CMP-052–054: placement-gated Banner experience cards, template selection, fullscreen Cancel/Done, existing history and rows, device/canvas/outlines/style/personalization/language/Copywriter tools. Link, Phone Capture, Email Capture and Manage Subscriptions serialize into functional HTML. Capture handlers call connected Braze SDK setters and flush; unavailable SDK remains explicit and sandbox preview inert. Block translations compile into recipient-language Liquid branches.
- CMP-055–057: Content Card device/language controls, Compose/Settings/Test, accessibility, Compose Pin, platform actions, retained lifecycle controls. New cards default None; legacy saved destinations infer the former web action.
- CMP-058–059: selected-group capability gating for MMS/RCS and Contact Cards, readable legacy content, message-bubble preview and working language/Liquid/configured-provider Copywriter tools.
- CMP-060–063: initial Webhook template selection, Choose New Template, managed credentialId reference selector, split request preview and Compose/Test, languages, removal of deployment-variable copy from the editor.
- CMP-064–066: WhatsApp subscription-group-first flow, subsequent WABA/type/layout selection with explicit confirmation, eight retained layouts, persisted response languages/URL preview, left preview and reduced provider information in primary compose flow. Fresh setup selects a layout; legacy response drafts retain their layout.
- CMP-067–068: group-gated LINE Launch editor, fullscreen Compose/Settings/Preview, Cancel/Done, Undo/Redo, device/personalization/Copywriter, four source block labels mapped onto existing models. Existing Flex drafts and five-message validation remain supported.

## Validation

Node 22.22.3: tsc --noEmit passes; 76/76 focused tests pass across channel-fidelity-2026-10-30, IAM traditional/runtime/model, LINE, SMS, WhatsApp, Webhook and channel parity suites. New tests verify compiled payloads, platform actions, dark modes, recipient languages, SDK form setters, credential references and Copywriter email compatibility. Use --experimental-transform-types for existing catalog parameter properties. No browser, server, full build, commit or branch changes by this agent.

## Integration

Root owns common previews and must use compiled current content/language. Root/shared forms own subscription-group capability persistence and launch/test enforcement. Managed Webhook credentials require root to expose redacted /api/resources/webhook-credentials metadata and resolve variant.credentialId server-side for delivery. Prepared WhatsApp payload includes urlPreview. IAM runtime accepts profile.platform and profile.colorScheme/theme. Browser visual verification remains with root. Existing MMS/RCS deep editor behavior is retained because the source account could not verify it.
