# CMP-001 campaign navigation follow-up

Compared the campaign sidebar/top navigation against `docs/implementation/campaigns-followup-2026-10-30/source-review.png`, its `source-navigation-assets.json`, the original `01-braze-list.jpg` and DOM. Read bundled Next use-client guidance before edits.

Bounded dashboard sidebar/topbar JSX now uses the supplied `public/braze-campaigns` SVGs: working Minimize/Expand button, workspace brand avatar and current saved workspace name, 24px navigation icons mapped by route key, Home display label, source Messaging section selection, actual footer logo and profile/Operator artwork. Existing navigation/workspace selection and topbar handlers remain connected. The Community icon preserves the existing display-only behavior; this change does not invent an unavailable community submenu. Removed an unused WhatsApp model import after verifying no remaining usages.

Appended Campaigns-only CSS sets source vertical spacing, the quick-link divider, pink active rail/logo, 40px topbar circles, responsive compact icons and a scrollable navigation body with a persistent brand footer. Outer app-shell/operator-open behavior, campaign editor content, email sending and Agentic Standards were left to their owners.

Validation: TypeScript noEmit passed with zero errors; no full build or worker browser run. Root owns browser review. This is the common campaign navigation portion of CMP-001; campaign list validation remains documented in the list implementation report.
