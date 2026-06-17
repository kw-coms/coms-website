# Member Community Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give regular COMS members transparent access to their deleted community posts and a way to request restoration.

**Architecture:** Reuse the existing deleted-community-post archive as the source of truth, add a small appeal table for member restore requests, and expose member-safe APIs under `/api/community/posts/deleted/me`. The web Community page gets a member-facing “내 삭제 기록” surface; admin-only archive remains the operational console.

**Tech Stack:** Spring Boot 4, JPA, Flyway, React 19, Vite, Playwright, Gradle.

---

### Task 1: Backend Trust Contract

**Files:**
- Create: `backend/src/main/java/com/coms/backend/domain/DeletedCommunityPostAppeal.java`
- Create: `backend/src/main/java/com/coms/backend/repository/DeletedCommunityPostAppealRepository.java`
- Create: `backend/src/main/java/com/coms/backend/dto/DeletedCommunityPostAppealRequest.java`
- Create: `backend/src/main/resources/db/migration/V47__deleted_community_post_appeals.sql`
- Modify: `backend/src/main/java/com/coms/backend/service/CommunityDeletionArchiveService.java`
- Modify: `backend/src/main/java/com/coms/backend/service/NotificationService.java`
- Modify: `backend/src/main/java/com/coms/backend/domain/Notification.java`
- Modify: `backend/src/main/java/com/coms/backend/service/CommunityService.java`
- Test: `backend/src/test/java/com/coms/backend/service/CommunityServiceAuditLogTest.java`

- [ ] Write failing tests proving author-only deletion history, restore appeal creation, and deletion notification.
- [ ] Add the appeal entity, repository, migration, DTO, and service methods.
- [ ] Send `COMMUNITY_POST_DELETED` notifications when an admin deletes another member's post.
- [ ] Run the targeted backend test and then full backend tests.

### Task 2: Web Member Surface

**Files:**
- Modify: `src/services/communityApi.js`
- Modify: `src/pages/Community.jsx`
- Modify: `src/App.jsx`
- Test: `tests/e2e/app-smoke.spec.js`

- [ ] Write a failing Playwright smoke test for the `내 삭제 기록` member panel.
- [ ] Add API client methods for member deletion history and restore appeals.
- [ ] Add a non-admin Community panel showing deleted title, reason, moderator, status, original text preview, and appeal action.
- [ ] Route deletion notifications to `/community?view=deleted`.
- [ ] Run targeted E2E, lint, build, smoke.

