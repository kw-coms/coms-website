# Appearance Controls Implementation Plan

> **For agentic workers:** use the supplied bounded ownership and existing project patterns. The leader integrates and verifies.

**Goal:** Let visitors choose/replay the former intro and make theme/effect/accent settings clearer.

**Architecture:** Extend existing theme utilities and App state; keep ComsIntro as the single lifecycle controller. Restore the historic canvas renderer in a lazily loaded component. Extend the existing settings sheet and central accent variables.

**Tech Stack:** Existing React, TypeScript, CSS, Node assertions, Playwright; no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-appearance-controls-design.md`

## Global constraints

- Preserve dark/current-intro/standard-accent defaults and existing font/account behavior.
- Reduced motion and lite always suppress intro playback; do not autoplay a heavy legacy renderer on mobile by default.
- Keep once-per-tab visits, optional preview, skip/scroll restoration and exactly one screen-on event.
- Storage failures do not crash the page; no new dependencies.

## Review focus

- Denied storage: current changes apply and startup remains usable.
- Preview outside home: no navigation, no stuck overlay, focus returns.
- StrictMode/unmount: release canvas frames, timers, image handlers and overflow.
- Disabled intro/lite/reduced motion: no startup wait for an intro that will not run.
- Extreme custom colors: vivid selections remain readable in both themes; semantic statuses retain their meaning.

## Task 1: Restore renderer (executor ownership)

Files: create `src/components/common/LegacyIntroCanvas.tsx`, `tests/legacyIntro.test.mjs`.

Interface: default export `LegacyIntroCanvas({ onDone }: { onDone: () => void })`; renders only an aria-hidden full-size canvas. Parent owns overlay, session state, skip, deadline, overflow and event. Restore existing drawing/data/assets from `96d4163f^`; do not reinvent the sequence. Completion/no-canvas calls `onDone`; clean up rAF, listeners and image handlers on unmount. No scroll/session modifications in the renderer.

- [ ] Write and run failing lifecycle checks for completion/no-canvas/cleanup.
- [ ] Restore renderer under the fixed interface.
- [ ] Run renderer checks and report provenance/remaining gaps.

## Task 2: Preferences and lifecycle (leader)

Files: modify `src/utils/themeColors.ts`, `src/App.tsx`, `src/components/common/ComsIntro.tsx`, `src/utils/perfMode.ts`, intro/preferences tests.

Interfaces: `IntroStyle = 'cinematic' | 'legacy' | 'off'`; `AccentStrength = 'standard' | 'vivid'`. Export storage keys and validated getters from themeColors. ComsIntro accepts optional `introStyle`, `preview`, `onComplete` (existing no-prop tests retain current behavior). Legacy renderer loads only for legacy. Preview doesn't consume visit flags and completion returns focus. Off mode skips the performance intro wait.

- [ ] Add failing preference and intro preview/off regressions.
- [ ] Implement local App state/persistence/tokens and controller integration.
- [ ] Verify existing intro/performance behavior and new checks.

## Task 3: Settings and visual expression (leader)

Files: `AppearanceControl.tsx`, `styles/intro.css`, relevant footer/nav styles, `tests/e2e/appearance.spec.js`.

Add accessible intro choice, descriptive copy and preview; keep preview disabled with explanation for off/lite/reduced motion. Add standard/vivid choice and live accent sample. Continue the existing responsive sheet, focus and keyboard conventions. Keep the final reset action in the same position for the existing focus-trap behavior.

- [ ] Add behavioral UI coverage before implementation.
- [ ] Extend the current UI and CSS, preserving structure and touch targets.
- [ ] Inspect desktop/390px and both themes; run visual verdict before another visual edit iteration, recording unavailable capture honestly.

## Task 4: Integrate and release

- [ ] Targeted tests, full `npm test`, PWA build and emitted-chunk checks.
- [ ] Impeccable detector on changed UI targets, independent review, resolve findings.
- [ ] Rebase on latest main including the separately released blockchain-study correction.
- [ ] PR, green CI, merge, supported deploy workflow, verify live entry/intro assets and health.
