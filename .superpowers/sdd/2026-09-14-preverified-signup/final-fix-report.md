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

## Authorized residual lock round — 2026-09-15

### Finding addressed

The per-email monitor in `PendingSignupService.start(...)` was held only inside the
`TransactionTemplate` callback. The callback released the monitor before
`TransactionTemplate.execute(...)` committed, so another same-email request could pass the
duplicate check against the still-uncommitted row.

### RED evidence

1. Commit-boundary concurrency regression:

   Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest.concurrentStartWithSameEmailRemainsDatabaseSafe'`

   Result: RED, 1 test run, 1 failed. The transaction test synchronization held the first
   request in `beforeCommit`; the second request entered after the callback monitor was
   released. Actual outcomes were `[SUCCESS, SUCCESS]`, while the required outcomes were
   `[SUCCESS, CONFLICT]`.

2. Complete pending-signup RED set before production edits:

   Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`

   Result: RED, 14 tests run, 2 failed.

   Failures:
   - Same-service commit-gap regression returned `[SUCCESS, SUCCESS]` instead of one success
     and one 409 conflict.
   - Two independently constructed service instances passed the duplicate check, then the
     H2 case-insensitive unique index rejected one insert with
     `DataIntegrityViolationException` / Hibernate `ConstraintViolationException` for
     `PUBLIC.UQ_PENDING_SIGNUPS_EMAIL_CI`; the service exposed that database exception instead
     of returning 409.

   The separate test-only `uq_pending_signups_phone_test` violation remained a raw
   `DataIntegrityViolationException`, establishing that unrelated integrity failures must not
   be translated.

### Implementation

- Replaced the attacker-controlled email-to-lock map with 64 fixed lock stripes selected by
  the normalized lower-case email hash.
- Moved synchronization outside and around the complete
  `transactionTemplate.execute(...)` call, so the monitor is held through transaction commit.
- Kept V92's `uq_pending_signups_email_ci` database index as the cross-instance authority.
- Added scoped `DataIntegrityViolationException` translation: only a Hibernate
  `ConstraintViolationException` whose constraint-name components match
  `uq_pending_signups_email_ci` becomes HTTP 409. Named violations for other constraints and
  integrity failures without distinguishable constraint details are rethrown.
- Strengthened concurrent tests to accept only one `SUCCESS` and one `CONFLICT`; unexpected
  runtime exceptions now fail the test instead of being counted as an ordinary loser.

### GREEN / verification evidence

1. Focused pending-signup service:

   Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`

   Result: PASS, `BUILD SUCCESSFUL in 13s`; 14 tests, 0 failures, 0 errors, 0 skipped.

2. Full backend:

   Command: `cd backend && ./gradlew test`

   Result: PASS, `BUILD SUCCESSFUL in 49s`.

   Fresh JUnit XML summary: 70 XML files; 497 tests, 0 failures, 0 errors, 1 skipped.

   Skipped: `TEST-com.coms.backend.config.PostgresMigrationExecutionTest.xml` because
   `COMS_PG_TEST_URL` is not set locally.

3. Diff whitespace:

   Command: `git diff --check`

   Result: PASS, no whitespace errors.

4. Final focused recheck before commit:

   Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`

   Result: PASS, `BUILD SUCCESSFUL in 12s`.

### Residual concerns / boundaries

- PostgreSQL migration execution remains locally unverified because `COMS_PG_TEST_URL` is not
  configured; the real H2 unique-index collision test covers the service-level translation
  path and exact constraint-name scoping.
- No frontend files or tests were changed in this residual backend-only round.
- No push, PR, merge, deployment, production access, or subagents were used.
