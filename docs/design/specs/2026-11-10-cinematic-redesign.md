# Cinematic redesign and navigation regrouping (2026-11-10)

Rollback point: tag `backup/pre-cinematic-20261110` (main at 8201d62d). Frontend only; no API, schema or
backend change. Reverting the merge commit restores the previous site.

## Why

Feedback from members: "there are so many features it feels chaotic / dizzying". The owner wants a film-like
site with motion on scroll (reference: cinetic-creatives.com; pattern references: Awwwards
scroll-storytelling pieces, NN/g on grouped mega menus) and does not want features removed.

Measured causes:

1. The desktop bar shows 13 equal top-level items in 12px English text (About, Activities, Study, Lab,
   Projects, Recruit, Notices, Records, Tools, Sponsors, Resources, Community, Apps), three with lock icons.
2. A logged-out visitor's home shows member-only blocks: the "Member loop" hub, seven tool shortcuts and an
   empty month calendar with a login prompt.
3. Every home section is the same grid of bordered cards with small type, so nothing leads.
4. Constant ambient motion and decoration: the dot field, the pill marquee, glows, pinging dots, numbered
   eyebrows on every block. More than 30 keyframe animations ship today.

## The idea: one shot at a time

Film feels calm because the frame holds one subject. "Cinematic" here means large type, few elements per
viewport, slow deliberate moves tied to the scroll, and darkness around the subject. It does not mean more
things moving.

Motion budget (binding for every lane):

- At most one focal animation per viewport. Nothing loops forever outside the opening scene's background.
- Motion is caused by the visitor (scroll, hover, focus, navigation), not by a timer. Remove the marquee and
  other perpetual loops this work touches.
- Entrances: 600 to 900ms, `cubic-bezier(0.16, 1, 0.3, 1)`, travel of 24px or one line height at most.
  Content never un-reveals once shown.
- No scroll hijacking: no scroll-snap, no horizontal scrubbing, no smooth-scroll library. One short pinned
  moment on the home page (scene 2) is the limit.

## Rules for every lane

- No feature, route or page is removed. Everything reachable today stays reachable in at most two actions.
- No new npm dependency. Motion is CSS plus small hooks. Animate only `transform`, `opacity`, `clip-path`.
- Three existing switches must keep working and look deliberate: light and dark theme (`data-theme-mode`)
  with the user accent colour, lite performance mode (`:root[data-perf='lite']`), and
  `prefers-reduced-motion: reduce`. In lite and reduced motion there is no pinning, no scrubbing and no grain:
  pinned tracks collapse to normal flow and all content is visible at once.
- Text stays real DOM text. Keyboard focus order follows reading order. Contrast stays at WCAG AA (the
  accessibility Playwright project must pass).
- Tests are updated to the new structure, never deleted, skipped or weakened. A test that asserted "X is
  reachable from the nav" must still assert that through the new menu.
- Use the existing tokens in `src/styles/tokens.css`. Comments in code are plain English, short.
- User-facing copy is Korean; do not invent facts about the club. Reuse copy from `src/data/homeContent.ts`.

## Lane A: navigation (branch `feat/nav-groups`)

Four groups replace the 13 items. Korean label first, the current English name as a small secondary label.

| Group | Items |
|---|---|
| 동아리 (Club) | 소개 /about, 활동 /activities, 프로젝트 /projects, 후원 /sponsors, 지원 /recruit |
| 배움 (Learn) | 스터디 자료 /study, 회로 Lab /lab/ |
| 멤버 (Members) | 공지 /notices, 커뮤니티 /community, 자료실 /resources, and every item of the current `records` group |
| 도구 (Tools) | every item of the current `tools` group, Apps /apps |

- One data source: export `navGroups` from `src/data/homeContent.ts` (id, label, sub, items with id, label,
  sub/hint, path, icon, auth). The desktop bar, the mobile menu, the footer and the quick search read it.
  Keep the existing exports that other files import, or migrate their importers.
- Desktop (lg and up): one bar, 44px as today: logo, the four group buttons (14px), then a search pill
  ("빠른 이동" with the Ctrl/⌘K hint), notifications/account or 로그인. Opening any group (click, Enter/Space,
  and hover with a short intent delay) opens one full-width panel under the bar that shows all four groups
  as columns, the opened group emphasised: the whole sitemap at a glance. Escape closes and returns focus;
  Tab moves through the panel in column order; clicking outside closes; route change closes.
  `aria-expanded`/`aria-controls` on the group buttons; the active route's group shows the active underline.
- Member-only items show the lock only for logged-out visitors (keep `MemberLock` behaviour) and still
  navigate to the login redirect as today.
- "자주 가는 곳": count visits per nav item path in localStorage (`kwcoms-nav-visits:v1`, wrapped in try/catch),
  show the top three as a row at the top of the panel and of the mobile menu once the visitor has at least
  three counted visits. Pure functions in `src/utils/navVisits.ts` with a unit test in `tests/`.
- Mobile: the hamburger opens a full-screen overlay (not a dropdown list): the four groups as headed
  sections, all open, large tap targets (44px min), the tutorial entry, then account/login. Body scroll is
  locked while open; focus is trapped; Escape closes. The bottom tab bar stays.
- Keep `data-tour` anchors meaningful: update `src/data/tourSteps.ts` and the tour so each step still points
  at a visible element (group buttons replace per-item anchors where needed).
- Update `tests/mobileNavigation.test.mjs`, `tests/quickSearch.test.mjs`, and the e2e specs that touch the
  nav (`app-smoke`, `appearance`, `guest-gating`, `accessibility`, `site-tour`, `visualSupport.js`).

## Lane B: home as a film in scenes (branch `feat/cinematic-redesign`)

Shared primitives first, in `src/styles/cinema-core.css` (imported from `src/index.css`) and
`src/hooks/useSceneProgress.ts`:

- `useSceneProgress()`: one passive scroll listener plus rAF for the page; for each `[data-scene]` element in
  or near the viewport (IntersectionObserver gate) set `--p` = progress through its own height
  (`-rect.top / (height - innerHeight)`, clamped 0..1; for elements not taller than the viewport, entry
  progress from bottom edge to top edge). Does nothing in lite or reduced motion.
- `.cine-lines`: heading lines rise out of a mask (`overflow: clip` wrapper, inner span from
  `translateY(110%)`), staggered by `--i`, revealed once by an IntersectionObserver (`.is-revealed`).
- `.cine-wipe`: media revealed once by `clip-path: inset()` opening, same trigger.
- `.cine-hud`: 11px uppercase monospace (`ui-monospace` stack), letter-spacing 0.14em, muted colour.
- `.cine-grain`: one fixed, pointer-events-none overlay, inline SVG `feTurbulence` data URI, static (not
  animated), about 5% opacity.
- `.cine-scrub-words`: words as spans with `--i` and the parent's `--n`; each word's opacity goes from 0.16
  to 1 as the scene's `--p` passes it (pure CSS `clamp`/`calc`).

Each scene is one subject with generous empty space (section padding about `clamp(6rem, 14vh, 11rem)`), a
`.cine-hud` slate ("SCENE 02 · ABOUT") instead of today's numbered eyebrow, and a heading at
`clamp(2.25rem, 5.4vw, 5rem)`, weight 700, tracking -0.03em. Cards lose their borders-plus-shadow-plus-glow
stack: one hairline or one surface tint, not all three.

Home order for a logged-out visitor (story first):

1. **Opening.** Full viewport (`100svh`). Keep `HeroField` behind but quieter (lower contrast, slower), add
   static grain and a vignette. The wordmark (site setting `homeHeroTitle`, default "COM's") is the picture:
   `font-size: clamp(5rem, 21vw, 22rem)`, weight 800, tracking -0.05em, letters rising from a mask once on
   load. HUD corners in `.cine-hud`: top-left "KW COM'S · KWANGWOON UNIV.", top-right "SCENE 01 / 05",
   bottom-left the semester label, bottom-right "SCROLL". Sub copy (`homeHeroCopy`) and the two existing
   actions sit bottom-left on desktop, centred on mobile. The latest-notice chip stays for members. As the
   hero scrolls out the wordmark scales to 0.9 and fades and letterbox bars close from top and bottom
   (reuse `--hero-out`). The pills and the three highlights leave the hero. Remove the pointer tilt.
2. **Manifesto (about).** The only pinned moment: a track of about 180vh. `sectionStories.about.title` as
   `.cine-scrub-words`; then the body, the two actions, the about stats, the three hero highlights and the
   experience pills as a static row. `ClubOsVisual` beside it on desktop, below on mobile.
3. **Activities.** The section copy, then the items (`LearningStackVisual`, the three `showcaseItems`, the
   `activityDetails` cards) as a vertical sequence of wide "frames", two per row at most on desktop, each
   with a frame code ("A-01") and a `.cine-wipe` entrance. No horizontal scrubbing.
4. **Projects, an index.** `sectionStories.projects` heading, then full-width rows (number, title, tag,
   arrow) for `projectDetails`; hover or focus expands the row to show its description. `ProjectLabVisual`
   and the stats sit sticky at the side on desktop.
5. **Members.** Logged out: "멤버가 되면" with the three hub items (lock shown) and the tool shortcuts as
   compact chips; no calendar. Logged in: this scene moves directly under the opening as "오늘의 COM's":
   latest notice, hub cards, shortcuts, and `ClubCalendarSection compact`. Members get function first.
6. **Recruit, the finale.** Full viewport, the recruit title very large, drifting a few percent sideways
   with `--p` (scroll-tied only), then the recruit copy, actions, stats and `JoinFlowVisual`.

Also: a scene rail fixed at the right edge on desktop (01 to 05 with short Korean names, current one
highlighted, click to scroll, `nav` with `aria-label`), which tells the visitor where they are and how much
is left; remove the pill marquee band and `home-snap-scroll`. `HomeView.tsx` may be split into scene
components under `src/pages/home/scenes/`. Delete CSS the rewrite makes dead.

## Lane C: shell (same branch as B, after A is merged in)

- Route change: restyle the existing `.coms-page-enter` (keyed remount in `App.tsx`) as a short fade with a
  12px rise (about 450ms). No router change.
- Inner pages: one shared page header treatment through the shared classes the detail pages already use
  (HUD crumb such as "COM'S / ACTIVITIES", large title with `.cine-lines`, lede), applied by CSS and shared
  components rather than page-by-page rewrites. Body content and behaviour unchanged. Apply the calmer card
  rule (one hairline or one tint) to the shared card classes.
- Footer (`AppearanceControl.tsx`): the sitemap from `navGroups` in four columns and an oversized outlined
  wordmark; the appearance controls keep working.
- `ComsIntro`: a film-leader style title card, at most 1.8s, skippable, once per session, never under
  reduced motion or lite.

## Acceptance

`npm test`, `npm run build`, `npm run smoke`, `npx playwright test --project=accessibility` pass. Screenshots
at 1440 and 390 wide, both themes, plus lite and reduced motion, reviewed for overlap and overflow. The
darwin visual baselines are regenerated only for views this change intentionally redraws.

## Round two (2026-11-10, owner decision)

The owner saw the shipped home page: the first screen was too plain, the backgrounds too plain, the motion
faded as the page went on, and the manifesto sentence was weak. Round one was too restrained. This round adds
richness and motion in every scene while keeping it smooth and readable. It replaces the "Motion budget" above
for full mode only; `:root[data-perf='lite']` and `prefers-reduced-motion` keep the static behaviour, and every
scene stays fully readable there.

Changed motion budget (full mode):

- Ambient motion is allowed again, but only while its scene is on screen. A scene that leaves the viewport
  loses `.is-onscreen` and every looping animation inside it is `animation-play-state: paused`. Background
  loops are 20s or longer.
- Still animate only `transform`, `opacity`, `clip-path`, plus the gradient position of a text sheen (and
  `letter-spacing` on the single recruit title). No `filter` on large surfaces. Still no scroll-snap, no
  horizontal scroll hijack, no smooth-scroll library, no new dependency.
- Every scene has at least one scroll-linked effect (driven by `--p`) and one entrance sequence, so motion
  never thins out toward the bottom of the page.
- Decorative text (scene numerals, divider bands, the ticker) is drawn with `::before { content: attr() }`
  so it is not DOM text and stays out of the accessibility tree.

Built: an aurora, perspective grid floor, a wireframe cube, a sheen and a typed highlights line on the
opening, with a ticker along its bottom edge; a backdrop per scene (colour wash that crossfades between scenes,
glow fields and a texture that differ per scene, a giant outlined numeral); divider bands of outlined scene
names between scenes; and per-scene scroll effects (a manifesto whose Club OS assembles and whose stats count
up, parallax and tilt on activity frames, a projects index with a changing numeral and progress line, a members
ripple, a recruit title that scales in with a marquee below it). The scene rail fills as the current scene
passes. The manifesto sentence is now "배운 건 만들어 보고, 만든 건 함께 나눕니다."
