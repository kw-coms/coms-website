# Final fix wave report — preverified signup

Date: 2026-09-14
Worktree: `/Users/choi/.config/superpowers/worktrees/coms-website/preverified-signup`
Branch: `feat/preverified-signup`

## Scope

Fixed the three final-review findings without changing the spec/plan, pushing, opening a PR, touching production, or spawning subagents.

## Changes

- `PendingSignupService.start(...)` now deletes expired pending rows with the candidate email inside the existing start transaction before duplicate pending-email validation and pending save. The `lower(email)` unique index remains in V92.
- `PendingSignupService.start(...)` also serializes same-JVM candidate-email start attempts around duplicate-check/save. This keeps the H2 `create-drop` test schema safe while the production PostgreSQL functional unique index remains the cross-process DB backstop.
- `AdminMembers.handleCreateSubmit(...)` now uses a ref-level in-flight guard so two rapid submit events cannot emit duplicate create-member POSTs before React state disables the button.
- The member-create form error now renders with `role="alert"`.

## RED evidence

1. Backend pending signup:

   Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`

   Result: RED, 12 tests run, 2 failed.

   Failures:
   - `start deletes an expired conflicting pending email so another student can reuse it` failed with `ResponseStatusException` because the expired pending row still blocked candidate email reuse.
   - `concurrent starts for the same pending email leave only one pending row` failed with `expected: 1L but was: 2L`, proving the local service path could create two pending rows in the H2 test schema.

2. Frontend accessibility:

   Command: `node --import tsx tests/adminAccessibility.test.mjs`

   Result: RED, assertion failed because `AdminMembers.tsx` did not render the create-member error with `role="alert"` or `aria-live`.

3. Frontend rapid submit:

   Command: `npm run smoke -- --grep 'president adds a verified member'`

   Result: RED, 1 smoke test failed: expected `postCount` to be 1, received 2, proving two rapid submits emitted two POSTs.

## GREEN / focused evidence

1. Backend pending signup:

   Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`

   Result: PASS, `BUILD SUCCESSFUL in 9s`.

2. Focused backend auth lifecycle:

   Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest' --tests '*AuthControllerCookieTest' --tests '*AuthServiceTest' --tests '*LoginFailureRetentionJobTest' --tests '*AuthServiceLoginThrottleTest'`

   Result: PASS, `BUILD SUCCESSFUL in 14s`.

3. Frontend contract/accessibility/smoke:

   Command: `node --import tsx tests/preverifiedSignup.test.mjs && node --import tsx tests/adminAccessibility.test.mjs && npm run smoke -- --grep 'signup|president adds'`

   Result: PASS.

   Output included:
   - `preverified signup admin member contract passed`
   - `admin accessibility contract passed`
   - `3 passed (4.0s)`

4. Diff whitespace:

   Command: `git diff --check`

   Result: PASS, no whitespace errors.

## Full gates

1. Full backend:

   Command: `cd backend && ./gradlew test`

   Result: PASS, `BUILD SUCCESSFUL in 40s`.

   Fresh JUnit XML summary: 70 XML files; 495 tests, 0 failures, 0 errors, 1 skipped.

   Skipped: `TEST-com.coms.backend.config.PostgresMigrationExecutionTest.xml` (same local PostgreSQL-gated skip as prior report).

2. Frontend test:

   Command: `npm test`

   Result: PASS.

   Coverage of script: `typecheck`, `lint`, and package contract tests, including `admin accessibility contract passed`.

3. Frontend build:

   Command: `npm run build`

   Result: PASS, Vite built successfully in `286ms`; PWA generated `dist/sw.js` and `dist/workbox-9c191d2f.js`.

4. Full smoke:

   Command: `npm run smoke`

   Result: PASS, `61 passed (1.0m)`.

   Note: Vite emitted expected frontend-only backend proxy `ECONNREFUSED` warnings during mocked/no-backend smoke paths; Playwright completed green.

## Concerns / remaining gaps

- No push, PR, merge, deployment, production checks, or production cleanup were performed.
- Local full backend still has the known PostgreSQL migration execution skip because `COMS_PG_TEST_URL` is not set in this environment.
