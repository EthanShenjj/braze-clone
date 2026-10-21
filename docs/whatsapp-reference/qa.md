# WhatsApp Canvas replica verification — 2026-10-21

Implementation: http://127.0.0.1:3001/engagement/canvas/884f8c3a-c68a-44a5-86eb-dcdc288c1629?step=build&locale=en

Source: https://dashboard-09.braze.com/engagement/canvas/6ad5c487dafef5008663bb52/6ad0b98fe4b4110085216601?locale=en&version=flow&isEditing=true&step=build

## Scope and source access

The user authorized temporarily adding an unsaved WhatsApp node. The source was inspected through subscription selection, message-type selection, template list and details, Compose/Settings/Test, response layouts, Quick Reply, Carousel, Flow, Product/Catalog and delivery settings. The temporary node was then removed. Neither Save nor publishing nor actual test sending was performed on Braze. `source-restored.png` records the Canvas after removal.

This is a local interactive replica. Meta synchronization, provider approval, actual message delivery, intelligent scheduling and a live conversation-window lookup are not connected. Flow and Product show their unconfigured account state and cannot pass local send validation. The window control and test preparation are explicitly simulations.

## Visual comparison

Desktop captures: 1440 × 693 CSS px, 1440 × 693 image pixels, density 1. The combined comparison images were opened together and reviewed, rather than judging separate images from memory.

- `comparison-delivery.png`: full-view source/implementation, default disabled timing state. The source is a disconnected incomplete step; the local demo is connected and configured, so step badges and underlying navigation differ. The local retained custom time is 18:30; source default is 5:00 pm. These are data/native-control differences.
- `comparison-template.png`: matched abandoned_onboarding template, Compose tab, numbered placeholders, empty media URL, English and two quick replies. Crops use the same content coordinates (334,276) through (1307,693). Preview pane, form columns, fields, copy and palette were compared together.
- `comparison-layouts.png`: all eight response-layout tiles with no selection. Crops align the grid origin: source (334,27), implementation (334,33). This removes the six-pixel difference in scroll position, without scaling or changing either image.
- `comparison-layouts-before.png`: earlier comparison that exposed vertically centered content in shorter tiles. The final tiles use a shared top alignment; titles and descriptions no longer drift between cards.
- `comparison-mobile.png`: 390 × 844 CSS/image pixels, density 1. Source overflows horizontally. The local editor retains the existing application's responsive treatment: stacked columns and an accessible Done button. This is an intentional usability adaptation, not a claim of pixel-identical source overflow.

Reviewed surfaces: Aribau regular/bold fonts, modal and step-card layout, column proportions, form rhythm, purple selected controls, green/amber status treatment, beige preview, white message bubble, numbered-variable chips, eight layout illustrations and message-specific copy. Eight source SVG files were downloaded from the observed Braze CDN URLs. Carousel, Product and WhatsApp SVGs were copied from the rendered DOM. Fonts reuse existing local source assets. Small action icons use the existing Lucide set.

## QA iterations

1. P1: The previous Canvas reused the generic Campaign phone/card layout. Replaced with the captured Canvas shell, Channels → Subscription Group → message type flow, template browser, template metadata and left-preview/right-composer layout.
2. P2: The previous response picker exposed five layouts. Added the captured eight-entry picker, Carousel card editing and the unavailable Flow/catalog states.
3. P2: Generic readiness cards, phone chrome and prominent demo banners did not match source. Replaced with source-style preview and form hierarchy; local-simulation disclosure remains in the test flow/footer.
4. P2: Template preview showed literal mapped Liquid in Compose. Compose now shows the template's numbered chips; Test renders the selected preview user's values.
5. P2: Layout-tile titles drifted vertically according to description length. Fixed the shared top alignment and compared the recapture in `comparison-layouts.png`.
6. P2: Native time input updated its DOM value without persisting React state in browser testing. Added input-event handling and verified Save → reload → reopen retains 18:30.
7. Adjusted modal maximum width, preview inset and delivery fallback wrapping. Reopened final full-view/focused comparisons. No actionable P0/P1/P2 remains in the verified desktop local-replica scope.

P3 follow-ups: native select/time-picker chrome differs from Braze's custom widgets; small utility glyphs and some minor padding differ. Local fixture accounts/templates and the existing surrounding Canvas navigation differ from the source workspace. This report does not assert exact parity for provider-connected states that this account does not expose.

## Functional verification

- Canvas Message → WhatsApp, subscription-group IDs, message type, template search, grid/list switch and approved-template selection.
- Template status, fixed body/buttons, language, required variable mappings, Liquid insertion with fallback and preview.
- Response text, media/audio/document selectors, CTA, quick replies, list sections/rows, Carousel cards and configured/unconfigured states.
- Quick Reply header and optional buttons, language snippet insertion, list section addition, Carousel add/remove/reorder and Flow/Product empty states were exercised in the browser.
- Compose/Settings/Test, preview attributes, distinct per-user rendered test messages and encoded button URLs. A generated preview link was opened and its rendered content verified.
- Local media upload, library listing, content retrieval, rejected unsupported/empty/oversize files and preview snapshots were verified through HTTP tests.
- Done → Canvas Save → reload → reopen retained both variants, variable mappings, reply labels, group, timing fallback, 18:30 and delivery validation.
- Browser-only drafts disable backend test preparation. Local test and simulated delivery records include channel payloads.
- Inspected final browser error log: empty.
- 26 WhatsApp/Canvas/SMS model and storage regressions passed.
- `tests/whatsapp-api.py` passed.
- `tests/whatsapp-media-api.py` passed; its temporary resources were cleaned up.
- Final production build, including TypeScript, passed.
- `git diff --check` passed.

## Evidence index

`source-empty.png`, `source-message-types.png`, `source-template-list.png`, `source-template-compose.png`, `source-test.png`, `source-response-layouts.png`, `source-response-compose.png`, `source-product.png`, `source-delivery.png`, `source-mobile.png`, `source-restored.png`.

`implementation-template-compose.png`, `implementation-response-layouts.png`, `implementation-delivery.png`, `implementation-mobile.png`, `implementation-compose.png` and the combined comparisons above.

Functional references: [Braze two-way conversations](https://www.braze.com/docs/user_guide/channels/whatsapp/use_cases/two_way_conversation), [Braze Template Builder](https://www.braze.com/docs/user_guide/channels/whatsapp/message_features_and_optimization/template_builder). Visual implementation is grounded in the captured signed-in Canvas, not documentation screenshots.

final result: passed
