# Club Event Contests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build member-only club events where admins upload contest entries such as 회지 files, members cast one vote per event, and rankings are shown from real vote data.

**Architecture:** Add a dedicated backend event contest model instead of overloading activity logs or community posts. Reuse the existing member auth, admin route guards, storage service, and React app shell patterns.

**Tech Stack:** Spring Boot 4, JPA, Flyway, H2/PostgreSQL-compatible SQL, React 19, Vite, TanStack Query, Playwright.

## Global Constraints

- No new dependencies.
- Do not fabricate event content; show an empty state when no events exist.
- Event read and vote routes are authenticated; create/update/upload/delete routes require admin.
- Voting rule: one member can vote for exactly one entry per event; voting again changes their vote to the new entry.
- Uploaded entry files use existing storage service and support download through authenticated API routes.

---

### Task 1: Backend Event Contest Model

**Files:**
- Create: `backend/src/main/java/com/coms/backend/domain/ClubEvent.java`
- Create: `backend/src/main/java/com/coms/backend/domain/ClubEventEntry.java`
- Create: `backend/src/main/java/com/coms/backend/domain/ClubEventVote.java`
- Create: `backend/src/main/java/com/coms/backend/repository/ClubEventRepository.java`
- Create: `backend/src/main/java/com/coms/backend/repository/ClubEventEntryRepository.java`
- Create: `backend/src/main/java/com/coms/backend/repository/ClubEventVoteRepository.java`
- Create: `backend/src/main/resources/db/migration/V65__club_event_contests.sql`
- Test: `backend/src/test/java/com/coms/backend/service/ClubEventServiceTest.java`

**Interfaces:**
- Produces: `ClubEventService.createEvent`, `addEntry`, `vote`, `list`, `get`.

- [ ] **Step 1: Write failing tests**

```java
@Test
void adminCreatesEventAddsEntriesAndMemberVoteProducesRanking() throws Exception {
    var event = clubEventService.createEvent("회지 인기투표", "가장 좋았던 회지를 골라주세요.", start, end, "2026123456");
    var first = clubEventService.addEntry(event.id(), "봄호", "편집팀", "설명", pdf, "2026123456");
    var second = clubEventService.addEntry(event.id(), "여름호", "운영팀", "설명", pdf2, "2026123456");
    var voted = clubEventService.vote(event.id(), second.id(), "2026000001");
    assertThat(voted.entries()).extracting("id").containsExactly(second.id(), first.id());
    assertThat(voted.myEntryId()).isEqualTo(second.id());
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew test --tests com.coms.backend.service.ClubEventServiceTest`

Expected: fails because `ClubEventService` does not exist.

- [ ] **Step 3: Implement minimal backend**

Create event, entry, and vote entities; repositories; service validation; Flyway migration.

- [ ] **Step 4: Verify GREEN**

Run: `./gradlew test --tests com.coms.backend.service.ClubEventServiceTest`

Expected: passes.

### Task 2: Backend API And Security

**Files:**
- Create: `backend/src/main/java/com/coms/backend/controller/ClubEventController.java`
- Create: `backend/src/main/java/com/coms/backend/dto/ClubEventRequest.java`
- Create: `backend/src/main/java/com/coms/backend/dto/ClubEventEntryRequest.java`
- Create: `backend/src/main/java/com/coms/backend/dto/ClubEventResponse.java`
- Create: `backend/src/main/java/com/coms/backend/dto/ClubEventVoteRequest.java`
- Modify: `backend/src/main/java/com/coms/backend/config/SecurityConfig.java`
- Test: `backend/src/test/java/com/coms/backend/service/ClubEventServiceTest.java`

**Interfaces:**
- Consumes: `ClubEventService`.
- Produces: `/api/club-events`, `/api/club-events/{id}`, `/api/club-events/{id}/entries`, `/api/club-events/{id}/entries/{entryId}/vote`, `/api/club-events/{id}/entries/{entryId}/download`.

- [ ] **Step 1: Write failing API/security assertions through service-visible behavior**

Extend service tests for vote window, cross-event entry rejection, changing votes, and closed event vote rejection.

- [ ] **Step 2: Verify RED**

Run: `./gradlew test --tests com.coms.backend.service.ClubEventServiceTest`

- [ ] **Step 3: Implement controller and security routes**

Use multipart forms for admin event and entry creation; use JSON for votes.

- [ ] **Step 4: Verify GREEN**

Run: `./gradlew test --tests com.coms.backend.service.ClubEventServiceTest`

### Task 3: Frontend Event Surface

**Files:**
- Create: `src/services/clubEventApi.js`
- Modify: `src/App.jsx`
- Modify: `src/data/homeContent.js`
- Modify: `src/index.css`
- Test: `tests/mobileNavigation.test.mjs`
- Test: `tests/e2e/app-smoke.spec.js`

**Interfaces:**
- Consumes: backend event API.
- Produces: route `/activity-events`, desktop/mobile Activity menu item, event list/detail/admin composer, entry list, ranking, vote button.

- [ ] **Step 1: Write failing frontend contract/smoke tests**

Assert `/activity-events` route exists, the Activity menu contains 이벤트, and mocked event data renders rankings and vote actions.

- [ ] **Step 2: Verify RED**

Run: `npm test`

- [ ] **Step 3: Implement frontend API and UI**

Add React query loader, event admin form, entry upload form, event list, detail/ranking view, authenticated empty states.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`, `npm run lint`, `npm run smoke`.

### Task 4: Final Verification And Commit

**Files:**
- All changed files.

**Interfaces:**
- Produces: a reviewable git diff and commit using the Lore protocol.

- [ ] **Step 1: Run backend tests**

Run: `./gradlew test --tests com.coms.backend.service.ClubEventServiceTest`

- [ ] **Step 2: Run frontend checks**

Run: `npm run lint`, `npm test`, `npm run smoke`.

- [ ] **Step 3: Inspect diff**

Run: `git diff --check` and `git status --short`.

- [ ] **Step 4: Commit if checks pass**

Commit event work and the already-approved activity-log UI changes together unless unrelated dirty files appear.
