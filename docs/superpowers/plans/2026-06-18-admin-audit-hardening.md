# Admin Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve actionable admin evidence for community reports, member deletion, and comment deletion so operators can answer who acted, what was affected, and why.

**Architecture:** Extend existing audit logging instead of adding a parallel moderation ledger. Store report post snapshots in `community_post_reports` so reports survive post deletion context, then record report resolution and deletion snapshots through existing `AuditLogService`.

**Tech Stack:** Spring Boot, JPA, Flyway SQL migrations, React admin page, Playwright smoke tests, JUnit service tests.

---

### Task 1: Preserve Community Report Post Snapshots

**Files:**
- Modify: `backend/src/main/java/com/coms/backend/domain/CommunityPostReport.java`
- Modify: `backend/src/main/java/com/coms/backend/dto/CommunityPostReportResponse.java`
- Modify: `backend/src/main/java/com/coms/backend/service/CommunityPostReportService.java`
- Create: `backend/src/main/resources/db/migration/V43__community_report_snapshots_and_audit.sql`
- Test: `backend/src/test/java/com/coms/backend/service/CommunityPostReportServiceTest.java`

- [ ] **Step 1: Write failing tests**

Add tests proving `report()` stores `postTitle`, `postAuthorStudentId`, and `postAuthorName` snapshots, and `listOpen()` returns those snapshots even when the post row is unavailable.

- [ ] **Step 2: Run targeted backend test and verify RED**

Run: `./gradlew test --tests com.coms.backend.service.CommunityPostReportServiceTest`

Expected: FAIL because response/entity snapshot accessors do not exist yet.

- [ ] **Step 3: Implement minimal snapshot storage**

Add nullable snapshot columns to entity/DTO, set them when creating a report, and prefer stored snapshots over live post lookup in response mapping.

- [ ] **Step 4: Run targeted backend test and verify GREEN**

Run: `./gradlew test --tests com.coms.backend.service.CommunityPostReportServiceTest`

Expected: PASS.

### Task 2: Audit Community Report Resolution

**Files:**
- Modify: `backend/src/main/java/com/coms/backend/service/CommunityPostReportService.java`
- Modify: `backend/src/test/java/com/coms/backend/service/CommunityPostReportServiceTest.java`

- [ ] **Step 1: Write failing tests**

Add tests proving `resolve(..., "ACCEPT", ...)` records `COMMUNITY_REPORT_ACCEPT` with report id, post id, reporter, resolver, reason, post title, and note, and `"REJECT"` records `COMMUNITY_REPORT_REJECT`.

- [ ] **Step 2: Run targeted backend test and verify RED**

Run: `./gradlew test --tests com.coms.backend.service.CommunityPostReportServiceTest`

Expected: FAIL because `AuditLogService` is not injected/used by the report service.

- [ ] **Step 3: Implement report resolution audit**

Inject `AuditLogService`, build a newline-delimited detail string from stored report snapshots, normalize note whitespace, reject unsafe text where reused helpers allow it, and record action after save.

- [ ] **Step 4: Run targeted backend test and verify GREEN**

Run: `./gradlew test --tests com.coms.backend.service.CommunityPostReportServiceTest`

Expected: PASS.

### Task 3: Keep Deleted Community Report Rows

**Files:**
- Modify: `backend/src/main/resources/db/migration/V43__community_report_snapshots_and_audit.sql`

- [ ] **Step 1: Add Flyway migration**

Add snapshot columns and alter the `community_post_reports.post_id` foreign key from `ON DELETE CASCADE` to `ON DELETE SET NULL`, while keeping `post_id` nullable for historical report context.

- [ ] **Step 2: Run backend tests**

Run: `./gradlew test`

Expected: PASS.

### Task 4: Add Admin Deletion Snapshots for Members and Roster Entries

**Files:**
- Modify: `backend/src/main/java/com/coms/backend/service/AdminService.java`
- Modify: `backend/src/main/java/com/coms/backend/service/EligibleMemberService.java`
- Modify: `backend/src/main/java/com/coms/backend/controller/AdminController.java`
- Test: `backend/src/test/java/com/coms/backend/controller/AdminControllerTest.java` if present, otherwise create focused service tests around snapshot DTO helpers.

- [ ] **Step 1: Inspect existing service return patterns**

Use `rg` and file reads to find deletion methods and existing tests.

- [ ] **Step 2: Write failing tests or controller-level checks**

Prove member deletion and eligible-member deletion audit details include target student id/name/role or roster identity before deletion.

- [ ] **Step 3: Implement snapshot-returning deletion methods**

Return lightweight deleted-target records from services and pass them into audit detail strings in `AdminController`.

- [ ] **Step 4: Run targeted and full backend tests**

Run: `./gradlew test`

Expected: PASS.

### Task 5: Strengthen Comment Deletion Audit

**Files:**
- Modify: `backend/src/main/java/com/coms/backend/service/CommunityService.java`
- Test: `backend/src/test/java/com/coms/backend/service/CommunityServiceAuditLogTest.java`

- [ ] **Step 1: Write failing test**

Add a test proving admin comment deletion logs post id/title, comment author, deletedBy, deletedByRole, and a content preview.

- [ ] **Step 2: Run targeted backend test and verify RED**

Run: `./gradlew test --tests com.coms.backend.service.CommunityServiceAuditLogTest`

Expected: FAIL because comment deletion detail currently contains only `postId`.

- [ ] **Step 3: Implement comment deletion detail**

Capture comment snapshot before recursive deletion and record a newline-delimited audit detail consistent with post deletion logs.

- [ ] **Step 4: Run targeted backend test and verify GREEN**

Run: `./gradlew test --tests com.coms.backend.service.CommunityServiceAuditLogTest`

Expected: PASS.

### Task 6: Admin UI and Smoke Coverage

**Files:**
- Modify: `src/pages/Admin.jsx`
- Modify: `tests/e2e/app-smoke.spec.js`

- [ ] **Step 1: Add smoke expectations**

Verify audit filters/search include report resolution actions and member/roster/comment deletion details can be found in the logs tab mock data.

- [ ] **Step 2: Run smoke test and verify RED if UI labels are missing**

Run: `npm run smoke`

Expected: FAIL only if new labels/actions are not wired.

- [ ] **Step 3: Implement admin labels/filter additions**

Add Korean labels for `COMMUNITY_REPORT_ACCEPT`, `COMMUNITY_REPORT_REJECT`, and deletion audit detail visibility.

- [ ] **Step 4: Run frontend checks**

Run: `npm run lint && npm run build && npm run smoke`

Expected: PASS.

### Task 7: Publish and Merge

**Files:**
- Commit all intended files only.

- [ ] **Step 1: Run final verification**

Run: `./gradlew test`, `npm run lint`, `npm run build`, `npm run smoke`, and `git diff --check`.

- [ ] **Step 2: Create branch, commit, push, PR, merge**

Use branch `codex/admin-audit-hardening`, Lore commit trailers, PR body with validation, and merge to `main` when GitHub reports mergeable.
