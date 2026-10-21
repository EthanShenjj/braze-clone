# Canvas SMS editor visual and interaction QA — 2026-10-20

Scope: the Canvas SMS message-step editor, matched to the accessible Braze account. This is not an acceptance claim for the complete Canvas product or other channels.

Source: https://dashboard-09.braze.com/engagement/canvas/6ad5c487dafef5008663bb52/6ad0b98fe4b4110085216601?locale=en&version=flow&isEditing=true&step=build

Implementation: http://127.0.0.1:3001/engagement/canvas/b0e0458a-9eae-4e48-9ffd-fdc30dd966c3?step=build&locale=en

## Evidence

- Source visual truth: `docs/sms-reference/source-compose-content.png`.
- Implementation screenshot: `docs/sms-reference/implementation-compose-content.png`.
- Full-view comparison input: `docs/sms-reference/comparison-full.png`.
- Focused content comparison input: `docs/sms-reference/comparison-content.png`.
- Final populated editor: `docs/sms-reference/implementation-final.png`.
- Small-screen evidence: `docs/sms-reference/source-mobile.png`, `docs/sms-reference/implementation-mobile.png`.
- Desktop viewport: 1440 × 693 CSS px. Both screenshots: 1440 × 693 pixels, density 1; no density resampling. Full-view comparison adds a 30px label strip. Focused comparison uses the identical crop (330,125)–(1310,620) from each image.
- State: Compose, empty content, link shortening enabled, one selected SMS subscription group, scrolled to the bottom. Local group names differ because they come from local synthetic data.
- Mobile viewport: 390 × 844; override reset after inspection. Source desktop dialog clips horizontally at this size; local editor intentionally stacks the existing sections to keep controls reachable, consistent with this project's responsive behavior. Mobile is a usability adaptation, not a pixel-fidelity claim.

## Comparison history and findings

1. Initial comparison found a P2 typography mismatch: inherited Canvas wizard rules reset tab labels and action labels to regular 13px text. This changed tab density and spacing.
2. Fixed by mounting the dialog through a React portal and removing the surrounding wizard's typography cascade. Captured the revised implementation and compared the combined full-view and focused images again.
3. Post-fix comparison: no actionable P0/P1/P2 findings in the scoped desktop SMS content panel.

Required fidelity surfaces:

- Fonts/typography: reuses the existing locally stored Aribau regular and bold font assets; matches 14px bold tabs, 16px section headings, 13px controls, and 12px preview notes.
- Spacing/layout rhythm: matches the two-column preview/composer structure, 48px column gap, 344px bordered preview, 120px message input, grouped separators and large section spacing. Remaining few-pixel baseline differences are P3.
- Colors/tokens: matched gray message bubble, light gray borders, purple controls and selected-channel fill, dark active-tab underline, and white modal surface.
- Images/assets: no marketing images in this panel. Fonts are real locally stored source assets. Lucide icons substitute small source UI glyphs; the bubble tail and native select/checkbox rendering remain P3 differences. No hotlinked assets.
- Copy/content: source Compose, Contact Card Generator, Test and delivery copy reproduced. Actual subscription group names and user data come from the local workspace. Contact Card Generator matches the source account's MMS capability notice.

## Interaction verification

Verified through the browser:

- Add Message → choose SMS/MMS/RCS → subscription group.
- Edit body, live preview and billable-segment count.
- Add Personalization: first_name plus default value, insert into body.
- Add languages: English selection, Message field selection, generated Liquid conditional snippet inserted into body.
- Contact Card Generator: source-equivalent MMS capability notice and documentation link.
- Test: disabled without recipients; local test preparation succeeds with a recipient.
- Random-user personalization, custom-user attributes and invalid-JSON error/disabled send.
- Shortened preview links preserve trailing sentence punctuation.
- Copy preview link generates a rendered, read-only snapshot. Opened the resulting URL and verified SMS text and segment count.
- Delivery settings: timing checkbox, custom fallback option, audience validation toggle. A time-input event synchronization bug was found and fixed; 15:30 survives tab changes.
- Done → Canvas Save → reload → reopen restores message, group and delivery selections.
- Node inspector/actions remain available separately from the SMS editor.
- 390px layout keeps content and input controls reachable by scrolling.
- Inspected recent browser logs; no application error appeared in the inspected entries.

Automated verification:

- `tests/sms-model.test.mjs` plus Canvas model/store tests: 12 passing tests.
- `tests/canvas-sms-api.py`: test recipients, per-user rendering, preview attribute overrides, invalid groups/messages/recipients/Liquid, preview snapshot URL and HTML escaping pass.
- TypeScript check passed.
- Production build passed, including the new SMS test and preview routes. Subsequent time-input fix passed TypeScript and browser recheck.
- `git diff --check` passed.

## Intentional capability boundaries

- SMS sends produce local `test_prepared` events and audit records; no carrier/provider delivery is configured.
- Link shortening is a preview simulation; the fixed example short URL does not redirect to a provider-hosted destination.
- Operator review runs deterministic local checks, not BrazeAI.
- Intelligent Timing and audience-validation selections persist as draft settings. A scheduling/optimization worker is outside this implementation.
- No local Content Test Groups are configured; the test-group control is disabled. Individual recipients work.
- MMS/RCS sending and contact-card generation are not enabled in the source account captured for this task.
- Existing linked Campaign nodes continue to use their existing full Campaign editor, so edits do not silently sever campaign linkage.

## Implementation checklist

- [x] Capture source before implementation.
- [x] Compare source and local screenshots together at equal density.
- [x] Fix P2 typography drift and capture again.
- [x] Verify core SMS controls and persistence in browser.
- [x] Verify encoding boundaries and local test API.
- [x] Keep local preview running and open.

Follow-up polish: source bubble-tail shape, exact small UI glyphs, native select chrome, and several-pixel preview alignment. Existing page/sidebar differences are outside this scoped SMS change.

final result: passed
