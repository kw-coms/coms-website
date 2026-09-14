# 이메일 사전 인증 가입 및 관리자 회원 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이메일 인증 성공 전에는 실제 회원을 생성하지 않고, 회장은 회원 관리에서 인증 완료 회원을 직접 추가할 수 있게 한다.

**Architecture:** `pending_signups`가 검증된 가입 요청과 BCrypt 해시를 최대 24시간 보관한다. 기존 `/signup`과 `/confirm-signup` 계약은 유지하되, 확인 성공 트랜잭션에서만 `members`와 졸업생 명부 학번을 확정한다. 관리자 직접 생성은 별도 ADMIN API와 웹 폼으로 제공한다.

**Tech Stack:** Spring Boot 4, Java 21, Spring Data JPA, PostgreSQL/Flyway, React 19, TypeScript, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-preverified-signup-design.md`

## Global Constraints

- 기존 `/signup` → `/email-verification/confirm-signup` 요청 순서와 응답 필드를 유지한다.
- 비밀번호와 인증코드는 BCrypt 해시만 저장한다.
- pending은 권한·로그인·회원 목록·작성자 검색에 노출하지 않는다.
- 졸업생 명부 학번은 인증 완료 트랜잭션에서만 확정한다.
- 관리자 직접 추가는 ADMIN 전용이고 ADMIN 역할 신규 생성은 허용하지 않는다.
- 현재 미인증 회원 삭제는 배포 후 기존 purge 경로로 수행한다.
- 새 의존성을 추가하지 않는다.

---

### Task 1: Pending signup persistence and non-mutating roster preparation

**Files:**
- Create: `backend/src/main/resources/db/migration/V92__pending_signups.sql`
- Create: `backend/src/main/java/com/coms/backend/domain/PendingSignup.java`
- Create: `backend/src/main/java/com/coms/backend/repository/PendingSignupRepository.java`
- Modify: `backend/src/main/java/com/coms/backend/service/EligibleMemberService.java`
- Test: `backend/src/test/java/com/coms/backend/service/PendingSignupPersistenceTest.java`
- Test: `backend/src/test/java/com/coms/backend/service/EligibleMemberServiceTest.java`

**Interfaces:**
- Produces: `EligibleMemberService.prepareSignup(SignupRequest): PreparedSignup`
- Produces: `EligibleMemberService.claimPreparedSignup(long eligibleMemberId, String studentId): EligibleMember`
- Produces: repository lock methods `findByStudentIdForUpdate` and `findByIdForUpdate`

- [ ] **Step 1: Write failing persistence and roster tests**

```java
@Test
void pendingSignupStoresOnlyHashesAndExpiresAfter24Hours() {
    PendingSignup saved = repository.save(samplePending("$2a$password", "$2a$code"));
    assertThat(saved.getPasswordHash()).startsWith("$2");
    assertThat(saved.getVerificationCodeHash()).startsWith("$2");
    assertThat(saved.getExpiresAt()).isEqualTo(saved.getCreatedAt().plusHours(24));
}

@Test
void graduatePreparationDoesNotClaimRosterUntilConfirmation() {
    PreparedSignup prepared = service.prepareSignup(graduateRequest());
    assertThat(repository.findById(prepared.eligibleMemberId()).orElseThrow().getStudentId()).isBlank();
    service.claimPreparedSignup(prepared.eligibleMemberId(), prepared.studentId());
    assertThat(repository.findById(prepared.eligibleMemberId()).orElseThrow().getStudentId()).isEqualTo(prepared.studentId());
}
```

- [ ] **Step 2: Run tests and verify they fail because the entity/table and non-mutating API do not exist**

Run: `cd backend && ./gradlew test --tests '*PendingSignupPersistenceTest' --tests '*EligibleMemberServiceTest'`

- [ ] **Step 3: Add V92 and focused domain/repository code**

```sql
CREATE TABLE pending_signups (
  id UUID PRIMARY KEY,
  eligible_member_id BIGINT NOT NULL REFERENCES eligible_members(id),
  student_id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  verification_code_hash VARCHAR(255) NOT NULL,
  code_expires_at TIMESTAMP NOT NULL,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL
  name VARCHAR(100) NOT NULL,
  department VARCHAR(100),
  generation VARCHAR(10),
  phone VARCHAR(30),
  aspiration TEXT,
  interests VARCHAR(500),
  signup_type VARCHAR(20) NOT NULL,
  initial_role VARCHAR(20) NOT NULL
);
CREATE UNIQUE INDEX uq_pending_signups_student_id ON pending_signups(student_id);
CREATE UNIQUE INDEX uq_pending_signups_email_ci ON pending_signups(lower(email));
CREATE INDEX idx_pending_signups_expires_at ON pending_signups(expires_at);
```

Implement `PreparedSignup` as an immutable record containing the eligible row id, proposed account id, normalized generation and initial role. Preparation validates without writing; claim locks the eligible row and writes only during confirmation.

- [ ] **Step 4: Run the focused tests and migration smoke test**

Run: `cd backend && ./gradlew test --tests '*PendingSignupPersistenceTest' --tests '*EligibleMemberServiceTest' --tests '*LatestMigrationsSmokeTest'`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main backend/src/test
git commit -m "Keep unverified signup data outside the member table"
```

### Task 2: Start, resend and confirm signup without early member creation

**Files:**
- Create: `backend/src/main/java/com/coms/backend/service/PendingSignupService.java`
- Modify: `backend/src/main/java/com/coms/backend/service/AuthService.java`
- Modify: `backend/src/main/java/com/coms/backend/controller/AuthController.java`
- Modify: `backend/src/main/java/com/coms/backend/service/LoginFailureRetentionJob.java`
- Test: `backend/src/test/java/com/coms/backend/service/PendingSignupServiceTest.java`
- Test: `backend/src/test/java/com/coms/backend/controller/AuthControllerCookieTest.java`

**Interfaces:**
- Produces: `PendingSignupService.start(SignupRequest request, String clientIp): AuthResponse`
- Produces: `PendingSignupService.resend(String studentId, String clientIp): boolean`
- Produces: `PendingSignupService.confirm(String studentId, String code): boolean`
- Produces: `PendingSignupService.deleteExpired(Instant cutoff): int`

- [ ] **Step 1: Write failing lifecycle tests**

```java
@Test
void startDoesNotCreateMemberAndConfirmCreatesExactlyOneVerifiedMember() {
    AuthResponse started = service.start(currentStudentRequest(), "198.51.100.8");
    assertThat(memberRepository.findByStudentId(started.studentId())).isEmpty();
    String code = capturedVerificationCode();
    assertThat(service.confirm(started.studentId(), code)).isTrue();
    Member member = memberRepository.findByStudentId(started.studentId()).orElseThrow();
    assertThat(member.isEmailVerified()).isTrue();
    assertThat(pendingRepository.findByStudentId(started.studentId())).isEmpty();
}

@Test
void concurrentConfirmationCreatesOneMember() {
    List<Future<Boolean>> results = invokeTwoConfirmationsForTheSamePendingRow();
    assertThat(results.stream().filter(this::completedSuccessfully).count()).isEqualTo(1);
    assertThat(memberRepository.countByStudentId(studentId)).isEqualTo(1);
}
```

Add cases for wrong code five times, expired code, resend replacement, banned member recheck, duplicate email, SMTP failure cleanup and expired-row retention.

- [ ] **Step 2: Run the lifecycle tests and verify RED**

Run: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest'`

- [ ] **Step 3: Implement the pending lifecycle**

Use `TransactionTemplate` so pending save commits before SMTP. On SMTP exception, call a separate `REQUIRES_NEW` cleanup bean method before returning `503`. Confirmation locks the pending row, revalidates membership constraints, creates `Member(emailVerified=true)`, claims the graduate roster id if needed, deletes pending, and records `SIGNUP_EMAIL_VERIFIED_MEMBER_CREATE`.

- [ ] **Step 4: Route existing endpoints to PendingSignupService**

```java
@PostMapping("/signup")
public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest request, HttpServletRequest servletRequest) {
    return ResponseEntity.status(HttpStatus.ACCEPTED)
        .body(pendingSignupService.start(request, resolveClientIp(servletRequest)));
}
```

Keep `request-signup` and `confirm-signup` DTOs and response fields unchanged. Remove the old path that writes an unverified `Member`.

- [ ] **Step 5: Run focused auth tests**

Run: `cd backend && ./gradlew test --tests '*PendingSignupServiceTest' --tests '*AuthControllerCookieTest' --tests '*AuthServiceTest'`

- [ ] **Step 6: Commit**

```bash
git add backend/src/main backend/src/test
git commit -m "Create members only after email verification succeeds"
```

### Task 3: President-only direct member creation

**Files:**
- Create: `backend/src/main/java/com/coms/backend/dto/AdminMemberCreateRequest.java`
- Modify: `backend/src/main/java/com/coms/backend/controller/AdminController.java`
- Modify: `backend/src/main/java/com/coms/backend/service/AdminService.java`
- Modify: `backend/src/main/java/com/coms/backend/service/EligibleMemberService.java`
- Test: `backend/src/test/java/com/coms/backend/config/OperationsSecurityIntegrationTest.java`
- Test: `backend/src/test/java/com/coms/backend/service/AdminServiceTest.java`

**Interfaces:**
- Produces: `POST /api/admin/members`
- Produces: `AdminService.createMember(AdminMemberCreateRequest request): MemberResponse`

- [ ] **Step 1: Write failing API/service tests**

```java
@Test
void presidentCreatesVerifiedMemberAndMatchingRosterRow() {
    MemberResponse created = service.createMember(new AdminMemberCreateRequest(
        "2026123456", "홍길동", "hong@example.com", "1234", "60", "USER", "컴퓨터정보공학부", null));
    assertThat(created.emailVerified()).isTrue();
    assertThat(eligibleRepository.findByStudentId("2026123456")).get().extracting(EligibleMember::getName).isEqualTo("홍길동");
}
```

Add tests for non-ADMIN 403, duplicate student/email 409, conflicting roster name 409, role ADMIN 400, transaction rollback and password hash matching `1234`.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && ./gradlew test --tests '*AdminServiceTest' --tests '*OperationsSecurityIntegrationTest'`

- [ ] **Step 3: Implement request validation and transactional creation**

`AdminMemberCreateRequest` validates ten-digit student id, Korean name, email, nonblank password, generation 1–99 and allowed non-ADMIN role. `AdminService` rechecks all invariants, creates or verifies the roster row without overwriting another name, BCrypt-hashes the temporary password, creates `emailVerified=true` member and records no secrets in logs.

- [ ] **Step 4: Run focused tests and commit**

Run: `cd backend && ./gradlew test --tests '*AdminServiceTest' --tests '*OperationsSecurityIntegrationTest'`

```bash
git add backend/src/main backend/src/test
git commit -m "Let the president add a verified member from member management"
```

### Task 4: Signup and member-management web UI

**Files:**
- Modify: `src/pages/Signup.tsx`
- Modify: `src/pages/admin/AdminMembers.tsx`
- Modify: `src/pages/admin/useAdminMembers.ts`
- Modify: `src/services/adminApi.ts`
- Modify: `tests/e2e/app-smoke.spec.js`
- Create: `tests/preverifiedSignup.test.mjs`

**Interfaces:**
- Consumes: unchanged `signupUser`, `requestSignupEmailVerification`, `confirmSignupEmailVerification`
- Consumes: `POST /api/admin/members`

- [ ] **Step 1: Add failing browser and contract tests**

```js
test('signup does not offer login until code confirmation creates the account', async ({ page }) => {
  await page.goto('/signup')
  // submit valid form, verify code screen, confirm, then done screen
  await expect(page.getByText('인증이 완료되어 계정이 생성되었습니다.')).toBeVisible()
})

test('president adds a verified member from member management', async ({ page }) => {
  await page.goto('/admin?tab=members')
  await page.getByRole('button', { name: '회원 추가' }).click()
  // fill fields and assert POST body excludes confirm password and marks no client-side email verification flag
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx tests/preverifiedSignup.test.mjs && npm run smoke -- --grep 'signup|president adds'`

- [ ] **Step 3: Update copy and add the admin form**

Change signup process copy to `가입 정보 확인 → 이메일 인증 → 계정 생성`. Keep the existing verify component and show `인증이 완료되어 계정이 생성되었습니다.` only after confirm succeeds.

Add a collapsed `회원 추가` form above the list with student id, name, email, temporary password, generation, role, optional department/phone. Roles are associate/user/officer/vice-president only. Show that email is immediately verified and the temporary password should be changed after first login.

- [ ] **Step 4: Run frontend tests**

Run: `npm test && npm run build && npm run smoke`

- [ ] **Step 5: Commit**

```bash
git add src tests package.json
git commit -m "Make signup completion match verified account creation"
```

### Task 5: Full verification, PR, deployment and cleanup

**Files:**
- Modify: `backend/openapi.json`
- Operational: production member cleanup through existing admin delete endpoint

**Interfaces:**
- Produces: committed OpenAPI contract for pending signup behavior and `POST /api/admin/members`

- [ ] **Step 1: Regenerate OpenAPI on isolated port 18083**

Run the dev/H2 backend with `--server.port=18083`, capture `/v3/api-docs` to `backend/openapi.json`, and stop only that PID.

- [ ] **Step 2: Run all gates**

Run: `cd backend && ./gradlew test`

Run: `npm test && npm run build && npm run smoke && npm run test:e2e:backend`

Expected: all pass; PostgreSQL migration execution runs in PR CI with zero skipped.

- [ ] **Step 3: Independent review and PR**

Review authorization, pending uniqueness, SMTP failure semantics, concurrent confirmation and personal-data retention. Open a PR against `main`; merge only with all checks green.

- [ ] **Step 4: Verify production before deletion**

Confirm exact deployed SHA, V92 success, health endpoints, zero backend errors, and `POST /api/admin/members` is 403 for anonymous access.

- [ ] **Step 5: Delete current unverified members through the existing purge path**

Re-query `members WHERE email_verified=false`, print only count and masked identifiers, call the ADMIN delete endpoint for each exact id, then verify count is zero and audit logs exist. Stop if the target set differs materially from the reviewed pre-deploy snapshot of one account.

- [ ] **Step 6: Production verification without synthetic signup identity**

Do not create a fake eligible student or send a signup code to an unrelated address. Verify the deployed endpoint shapes and empty pending/member invariants through read-only production queries, and rely on the PostgreSQL integration tests for the complete start/confirm lifecycle. Use the admin UI only to confirm the `회원 추가` form renders; do not create retained test data.
