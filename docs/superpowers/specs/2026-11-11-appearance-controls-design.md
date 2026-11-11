# Appearance controls

Extend the existing COMS screen-settings popover and mobile bottom sheet. The operator wants selectable intros, recovery of the former intro, more useful effect controls and clearer accent-color expression. Preserve the site's existing design and font/account behavior.

## Direction and assumptions

- Keep the current short cinematic intro as the default. Add `legacy` (the original terminal Earth/Korea/Kwangwoon/COM'S sequence restored from `96d4163f^`) and `off`.
- Version-selection assumption: the recovered terminal sequence is the requested former intro; keep it optional so the current default remains available.
- Add explicit preview from any route, without navigating or consuming the ordinary once-per-tab intro flag. Keep skip, scroll restoration, bounded deadlines and exactly one screen-on handoff.
- Existing effect choices remain `auto`, `lite`, `full`. Explain what changes and the currently applied mode. Never override reduced-motion or force a heavy intro in lite mode.
- Add accent strength `standard` (default/current look) and `vivid`. Vivid increases tinted surfaces and borders and highlights current navigation; preserve semantic status colors and readable text. Show a small live sample in settings.
- Reuse local storage helpers. Changes apply immediately and storage failure must never break the page. No new dependencies or design-system layer.

## Approaches

Extend the current settings surface and preferences: selected because it preserves the familiar interface and existing performance controls. A separate theme page or a full site restyle would add navigation and visual changes outside the request. Restoring the entire old intro controller would duplicate session/scroll/performance rules; restore only its renderer under the current controller instead.

## Verification

Preference validation/storage failures, intro off and preview, strict-mode lifecycle, skip/reduced-motion/lite handoff, renderer no-canvas/cleanup, and accent-token strength. Check desktop/390px settings, keyboard focus and persistence. Inspect rendered output when available and record any browser/device limits separately from unit/build evidence. Finish with review, CI, merge, deployment and live asset verification.
