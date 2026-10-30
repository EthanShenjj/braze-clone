# Email campaign fidelity implementation — 2026-10-30

Evidence: audit CMP-037–045 in `docs/audits/campaigns-fidelity-2026-10-29/findings.json`, DOM and saved screenshots 10/15/16/17/32. Read repository AGENTS.md and bundled Next.js `use-client` guide before editing. Existing uncommitted work was retained. No live Braze actions, delivery, server, browser, or builds were performed by this worker.

| Finding | Implemented | Limits / evidence boundary |
| --- | --- | --- |
| CMP-037 | Sending Settings shell with 60px icon rail, 174px navigation, paired form/preview panes, 54px header, 53px footer, source field ordering and preview labels. Navigation persists draft changes before content/test/close. | No post-change browser screenshot comparison; responsive preview collapses below 980px. |
| CMP-038 | Limited campaigns now render From/IP pool as source-style readonly text. Listed Reply-to/BCC remain available, while Customize Reply-to is disabled. Full access and explicit per-field `config.emailSendingCapabilities` retain allowed editing; `requireListedAddresses` always prevents custom reply. Subject/preheader and body editing remain available. | Source DOM confirms Reply-to/BCC selectors are enabled, unlike the disabled Customize Reply-to checkbox. This is campaign UI capability resolution, separate from workspace-preferences administration permission. |
| CMP-039 | Monospace, numbered Subject/Preheader Liquid fields, Add Liquid insertion, subject AI assist with real `/api/messages/assist` request and visible service errors. | Subject AI requires the existing connected AI service. No simulated generation. |
| CMP-040 | Email Headers/Extras groups, empty state, add/edit/remove rows; validation catches duplicate/protected headers and header injection. Runtime resolves Liquid and emits custom MIME/provider headers and rendered extras. | Extras are connector metadata; a provider without extras support must reject rather than silently discard (root integration). |
| CMP-041 | Attachment drag/drop, upload, actual media-library fetch, HTTPS URL/filename flow and removable list. Actual uploaded base64 size is checked in UI and compiler, capped at 2 MB. | URL/media attachment content without bytes is explicitly unresolved; native delivery requires root guard/resolver. Uploads retain content in the variant rather than claiming remote storage success. |
| CMP-042 | HTML editor uses source-style navigation → code → preview layout; HTML/Plaintext tabs and Classic/AMP under More; line numbers and sandboxed iframe preview. | Textarea-based source editor, not a recreation of the source proprietary code engine. |
| CMP-043 | Working case-insensitive search, match count and next selection; image URL/upload insertion; preview content-block expansion toggle; persisted CSS inlining setting applied by delivery compiler; Download file / Done. Fixed secondary-variant body reopening from primary. | Download exports authored HTML with Gmail head annotation; CSS inlining is performed by the delivery compiler. Content-block toggle affects preview only. |
| CMP-044 | Full Gmail Promotion page: basic logo/subject/image, discount code/offer/start/end, deal URL/price/currency, repeated promotion cards, generated/copied head HTML. Runtime automatically includes idempotent, script-safe JSON-LD and resolves annotation Liquid. | Audit verified initial page and section toggles. Expanded Deal Card/Promotion Cards controls implement working local configuration; deep original controls were not captured. Gmail decides display eligibility. |
| CMP-045 | Shared outer navigation now matches source32: Content title/back, Design and Build, Link Management, separator, purple Personalization/Languages with icons, separator, Create with Operator / Copy, bottom external Style Settings link. Removed extra Sending settings/Liquid/Subject sidebar entries. Real Grapes editing, right-panel Settings and icon-rail Sending Settings remain. Copy opens a real configured-assistant dialog and inserts only after review; Grapes Languages persists actual subject/preheader translations. | Original finding concerns outer navigation and is addressed independently of engine choice. Source Bee internals were unavailable, so internal pixel parity is unverified. Missing AI configuration returns the real service error; it is not simulated completion. |

## Persistence and delivery

`emailSending.headers`, `emailSending.extras`, `emailSending.customizeReplyTo`, `emailAttachments`, `emailCssInlining`, `emailGmailPromotion` are serializable variant settings. Existing EmailCompose saves email-prefixed properties in variant.config and legacy Sending Info in variant.sending. Root integration must preserve `emailGmailPromotion` and `emailCssInlining` root mirrors for non-primary variants in `preservePrimaryEmailDesign` and avoid secondary variants inheriting primary email settings accidentally. The generic connector already receives the full compiled message including extras, IP pool and From name.

`compileWorkspaceEmail` now applies Gmail annotations, custom headers/extras, preheader whitespace, and validates actual attachment byte limits. MIME output includes the sender display name. Known-size and actual-byte oversize attachments fail before provider dispatch. Unknown URL content cannot be honestly declared compliant until resolved.

## Files owned by this worker

- `app/ui/dashboard.tsx`: only isolated model import, EmailSending type, and bounded EmailSendingEditor function.
- `app/ui/braze-sending.module.css`
- `app/ui/email-dnd-editor.tsx`
- `app/ui/email-dnd.module.css`: appended compose shell outer-navigation rules only; existing dirty changes retained.
- `app/ui/email-grapes-editor.tsx`: outer navigation/title only; existing dirty changes retained.
- `app/ui/email-source-tools.tsx`
- New `app/ui/email-source.module.css`, `app/ui/email-gmail-promotion.tsx`, `lib/email-fidelity-model.ts`, `tests/email-fidelity.test.mjs`.
- `lib/email-runtime.ts`: custom compilation additions; preexisting attachment/MIME work retained.

## Validation

Node `/Users/ethanshen/.nvm/versions/node/v22.22.3/bin/node`:

```
node --experimental-transform-types --test tests/email-fidelity.test.mjs tests/email-runtime.test.mjs tests/email-liquid.test.mjs tests/email-grapes-template.test.mjs tests/email-grapes-drag.test.mjs
```

27 tests passed, covering all Gmail annotation types, disabled switches retaining configuration, JSON-LD script escaping/idempotence, header injection/protected keys/duplicates, extras prototype-safe keys and Liquid, compiled headers/extras/reply-to/preheader, decoded attachment bytes, serialized per-variant roundtrip, and existing Grapes migration/drag behavior. `--experimental-strip-types` alone is insufficient because existing catalog-model uses constructor parameter properties; the successful command uses transform-types. TypeScript `tsc --noEmit --pretty false` passed during integration. `git diff --check` for owned modified tracked files passed. No browser interaction or live provider delivery was performed.

## Integration review fixes

A focused root integration review found and fixed two delivery gaps:

- `emailVariantSendingIssues` now validates every email variant on upsert, ordinary launch, and multichannel email launch. Variant-specific errors include the variant name. Missing secondary sending settings resolve from workspace defaults, preserving isolation from the primary variant while allowing an incomplete new draft to save. Selected-variant test validation remains in the shared backend path.
- `compileWorkspaceEmail` now selects localized subject/preheader using normalized exact, base-language and Simplified Chinese fallback before Liquid rendering. Empty translations fall back to the default field. GA UTM parameters render Liquid, preserve other query values/fragments and apply to HTTP(S) anchor destinations before click-tracking URLs are generated. Non-web links/images remain unchanged and GA is independent of click tracking.
- Sending Info asynchronously loads actual workspace identity/IP pool/Reply-To/BCC defaults. Per-field dirty guards preserve edits made before preferences arrive.

New isolated SQLite tests in `tests/email-sending-policy.test.mjs` verify rejection of unlisted secondary identities, required BCC, safe workspace fallback, policy changes before launch and multichannel secondary validation. Three compiler regressions cover locale fallback/empty translations and GA URL/tracking order/disabled behavior. Test databases use temporary directories and live delivery is disabled; no user workspace data was changed.

The combined focused command now includes `tests/email-sending-policy.test.mjs` in addition to the earlier five email suites.

Final integration TypeScript check passed with incremental output disabled. Workspace fallback sender metadata also resolves the selected listed identity's display name/IP pool, rather than borrowing another sender's defaults.

## CMP-038 / CMP-045 acceptance follow-up

Rechecked original finding text and source10/source32 JPG and DOM against saved current screenshots `07-email-sending-settings.png` and `10-email-drag-editor.png`. Read AGENTS and bundled Next.js use-client guidance before edits. Shared `EmailContentNavigation` is used by the Grapes and legacy row builders to keep their outer hierarchy consistent. The source Style Settings link opens the real workspace drag-and-drop email preferences in another tab; local design styling is still available from the working editor’s SETTINGS tab. No proprietary Bee engine parity or external delivery success is claimed.

Additional files: `lib/email-sending-access.ts`, `tests/email-sending-access.test.mjs`, `app/ui/email-content-navigation.tsx`, `app/ui/email-content-navigation.module.css`. Dashboard edits were limited to one helper import and EmailSendingEditor. Field overrides accept only booleans: `{from,ipPool,replyTo,bcc,customReplyTo}`; missing access defaults to the source Limited-access UI. Workspace administration `permissions.canEdit` is deliberately separate from campaign sending capabilities.

Validation: `node --experimental-transform-types --test tests/email-sending-access.test.mjs tests/email-runtime.test.mjs tests/email-grapes-template.test.mjs tests/email-grapes-drag.test.mjs` passed **22/22**, including listed-only policy, explicit grants/denials, actual Grapes drag placement, primary-design isolation and localized subject/preheader compilation. `tsc --noEmit --incremental false --pretty false` passed. The first attempt using strip-only mode could not load an existing catalog parameter property; the transform-types rerun passed. Root owns browser verification and updated screenshots.
