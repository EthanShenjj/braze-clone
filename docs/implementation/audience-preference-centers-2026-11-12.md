# Email Preference Centers implementation — 2026-11-12

Source evidence: `docs/audits/audience-full-2026-11-12/source-20-preference-centers-list`, `source-22-preference-new-details`, `source-23-preference-description`, `source-24-preference-composer`, `source-25-preference-settings`, and `source-26-preference-language-liquid` (JPG, AX and DOM captures, Live – ittor workspace).

Implemented from those captures:

- Custom Email Preference Centers list and Landing Pages banner; create/details name (280 characters), description, generated Liquid/API ID, page choices, Launch Editor, draft save and launch.
- Full viewport composer with Compose/Settings/Preview tabs; independent Preference Center and Confirmation Page documents; one, two or three column rows; Title, Paragraph, Button, Image, Link and Spacer blocks; drag/drop and click insertion; undo/redo; phone/tablet/desktop width; outlines; personalization insertion; Cancel/Done.
- Common page width and unit, background and opacity, default/custom fonts, alignment, text/button/button-text/link colors and opacity. Per-block editable content, image URL/alt, actions and basic styles.
- Subscription group selection uses active Email groups from the current workspace. Draft and published versions retain the selected groups and both documents.
- Accessibility language and dynamic Liquid. The public endpoint resolves Liquid with the signed recipient's profile using the existing Braze Liquid engine, without returning that profile wholesale.
- Shared composer/details/public renderer honors actual image URLs and alt text, row columns, page styles, external links, save/unsubscribe/back actions and the configured confirmation document. The previous fake image logo was removed.
- Scoped CRUD/insights/publish APIs with existing recipient tokens and published-version isolation. Backend store validation and optimistic version checks are shared with the workspace.

Verification: `tests/preference-center-composer.test.mjs` covers two-page save/reload and published snapshot isolation, actual rendered image/link/column/language/width output, unsafe URL sanitization, and legacy migration. Additional existing management tests cover workspace and subscription group validation, versions and tokens.

Evidence limits:

- **The source Preview action was blocked by the browser security policy. It was not retried or bypassed. Its internal layout and interactions remain unverified.** The local Preview uses the same saved document renderer as public pages; this behavior is an implementation decision.
- Source per-block property panels, custom-font dialog, personalization menu, and row manipulation toolbars were not captured. Their functional controls are inferred implementations, not a verified pixel match.
- No source preference center was saved or launched. Persistence and public-recipient flows were verified only against isolated local test databases.

- The footer retains Send feedback and BrazeAI Operator controls with explicit unavailable capability tooltips. No preference-center AI or external feedback service is connected; no output or successful submission is fabricated.

Final visual fixes: list column sorting, source footer action alignment, exact public source illustrations `preference-editor.svg` and `preference-banner.svg` replace approximate/missing artwork. Asset URLs were read from the displayed DOM; no asset bundle or source Preview retry was used.
