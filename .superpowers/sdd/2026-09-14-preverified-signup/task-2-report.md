# Task 2 report — pending signup start/resend/confirm lifecycle

## Status

Implemented Task 2 in the `feat/preverified-signup` worktree without touching admin member creation, frontend, OpenAPI, production, or Task 3.

## RED evidence

- Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`
- Result: RED, compile failed before production implementation because `PendingSignupService` did not exist and the lifecycle test exposed the old missing pending-service boundary.
- Key output:
  - `cannot find symbol import com.coms.backend.service.PendingSignupService`
  - `cannot find symbol private PendingSignupService service`

## GREEN evidence

- Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`
- Result: GREEN, `BUILD SUCCESSFUL in 9s`.
- Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest' --tests '*AuthControllerCookieTest' --tests '*AuthServiceTest' --tests '*LoginFailureRetentionJobTest' --tests '*AuthServiceLoginThrottleTest'`
- Result: GREEN after final cleanup-compatible constructor adjustment, `BUILD SUCCESSFUL in 15s`.
- Command: `cd backend && ./gradlew test`
- Result: GREEN before the final constructor-compatibility adjustment, `BUILD SUCCESSFUL in 45s`.

## Implemented lifecycle

- `/signup` now starts a pending signup and returns the existing `AuthResponse` fields with HTTP `202 Accepted`; it does not create a `Member`.
- `request-signup` resends from `pending_signups` and preserves the constant response.
- `confirm-signup` locks the pending row, validates BCrypt code, rechecks bans and duplicate member/email state, claims the prepared roster signup, creates exactly one verified `Member`, deletes pending, and records `SIGNUP_EMAIL_VERIFIED_MEMBER_CREATE`.
- Pending rows are committed before SMTP send; SMTP failure deletes the exact pending version in a separate `REQUIRES_NEW` cleanup.
- Daily retention now purges expired pending signups through the existing auth retention job.

## Self-review

- Removed old eager-signup implementation and now-dead AuthService signup helper constants/maps/methods after repo-wide reference search confirmed no remaining callers in AuthService.
- Kept existing member email verification and password reset helpers intact.
- Preserved the AuthService constructor's existing `EligibleMemberService` slot to avoid unnecessary constructor API churn while routing signup work to `PendingSignupService`.

## Concerns

- The final full-suite run was completed before the constructor-compatibility adjustment; the subsequent focused command recompiled affected classes and passed.

## Fix round 1 evidence

### RED

- Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`
- Result: RED, `resendSendsAfterCommitAndFailureCleanupCannotTouchNewerVersion` failed because resend invoked SMTP while a transaction was still active.
- Key output: `PendingSignupServiceTest > resend sends SMTP after commit and failed cleanup cannot remove a newer pending version FAILED`.

### GREEN

- Command: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest' --tests '*AuthControllerCookieTest' --tests '*AuthServiceTest' --tests '*LoginFailureRetentionJobTest' --tests '*AuthServiceLoginThrottleTest'`
- Result: GREEN, `BUILD SUCCESSFUL in 16s`.
- Command: `cd backend && ./gradlew test`
- Result: GREEN, `BUILD SUCCESSFUL in 45s`.

### Fix summary

- Restructured pending signup resend to commit the pending-code update through `TransactionTemplate`, send SMTP after commit, and expire only the exact failed resend version in `REQUIRES_NEW`.
- Added a regression that asserts SMTP runs outside a transaction and that failure cleanup cannot touch a newer pending version.
- Removed unused `AuthService` clock field/assignment after repo-wide reference check; preserved the constructor parameter for compatibility.
- Removed unused `ZoneId` import by converting expiry cleanup with `clock.getZone()`.
