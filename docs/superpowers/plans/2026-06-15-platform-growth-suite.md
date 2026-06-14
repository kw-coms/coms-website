# Platform Growth Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the non-mobile COM's website into a stronger recruiting, retention, and operator workflow platform.

**Architecture:** Persist recruit applications so admins can review status and notes, add an admin overview that summarizes operational workload, and add member-facing activity hub signals from notices, community, and archive data. Keep the implementation inside existing React/Spring/Flyway patterns and avoid mobile/PWA surfaces.

**Tech Stack:** React 19, Vite, React Router, Playwright, Java 21, Spring Boot 4, JPA, Flyway, H2/PostgreSQL.

---

### Task 1: Recruit Application Workflow

**Files:**
- Create: `backend/src/main/java/com/coms/backend/domain/RecruitApplication.java`
- Create: `backend/src/main/java/com/coms/backend/repository/RecruitApplicationRepository.java`
- Create: `backend/src/main/java/com/coms/backend/dto/RecruitApplicationAdminResponse.java`
- Create: `backend/src/main/java/com/coms/backend/dto/RecruitApplicationStatusUpdateRequest.java`
- Create: `backend/src/main/resources/db/migration/V38__recruit_application_workflow.sql`
- Modify: `backend/src/main/java/com/coms/backend/service/RecruitApplicationService.java`
- Modify: `backend/src/main/java/com/coms/backend/controller/AdminController.java`
- Test: `backend/src/test/java/com/coms/backend/service/RecruitApplicationServiceTest.java`

- [ ] **Step 1: Write failing tests**

Add tests that verify submitted applications are persisted with `RECEIVED`, admin status updates persist `status` and `adminNote`, and invalid status values are rejected.

- [ ] **Step 2: Run recruit service tests and verify RED**

Run: `cd backend && ./gradlew test --tests com.coms.backend.service.RecruitApplicationServiceTest`

- [ ] **Step 3: Implement persistence and admin workflow**

Add the entity, repository, DTOs, Flyway migration, service list/update methods, and admin endpoints:
- `GET /api/admin/recruit-applications`
- `PATCH /api/admin/recruit-applications/{id}/status`

- [ ] **Step 4: Run recruit service tests and verify GREEN**

Run: `cd backend && ./gradlew test --tests com.coms.backend.service.RecruitApplicationServiceTest`

### Task 2: Admin Dashboard v2

**Files:**
- Modify: `src/services/adminApi.js`
- Modify: `src/pages/Admin.jsx`
- Modify: `tests/e2e/visualSupport.js`
- Test: `tests/e2e/app-smoke.spec.js`

- [ ] **Step 1: Write failing Playwright smoke test**

Add a test that opens `/admin`, verifies the new overview cards, opens the recruit tab, changes an application status, and sees the updated status/note.

- [ ] **Step 2: Run smoke test and verify RED**

Run: `npm run build && npx playwright test --project=smoke tests/e2e/app-smoke.spec.js -g "admin tracks recruit applications"`

- [ ] **Step 3: Implement admin overview and recruit tab**

Add `listRecruitApplications` and `updateRecruitApplicationStatus`, add dashboard summary cards, and add a recruit tab with filters, status select, note textarea, and saved feedback.

- [ ] **Step 4: Run smoke test and verify GREEN**

Run: `npm run build && npx playwright test --project=smoke tests/e2e/app-smoke.spec.js -g "admin tracks recruit applications"`

### Task 3: Member Revisit and Archive Signals

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/pages/Archive.jsx`
- Test: `tests/e2e/app-smoke.spec.js`

- [ ] **Step 1: Write failing Playwright smoke test**

Add a test that verifies the public home exposes an activity hub with notice/community/archive entry points and that the archive page exposes category/search affordances for repeat visits.

- [ ] **Step 2: Run targeted smoke test and verify RED**

Run: `npm run build && npx playwright test --project=smoke tests/e2e/app-smoke.spec.js -g "activity hub"`

- [ ] **Step 3: Implement activity hub and archive affordances**

Add a compact activity hub on the home page and strengthen archive filtering/search copy without changing API contracts.

- [ ] **Step 4: Run targeted smoke test and verify GREEN**

Run: `npm run build && npx playwright test --project=smoke tests/e2e/app-smoke.spec.js -g "activity hub"`

### Task 4: Final Verification and PR

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run backend tests**

Run: `cd backend && ./gradlew test`

- [ ] **Step 2: Run frontend checks**

Run: `npm run lint && npm run build && npm run smoke`

- [ ] **Step 3: Inspect diff and commit**

Run: `git diff --check`, `git status --short`, then commit with the Lore protocol.

- [ ] **Step 4: Push, open PR, and merge if checks allow**

Run: `git push -u origin codex/platform-growth-suite`, create a PR against `main`, wait for required checks, and merge when green.
