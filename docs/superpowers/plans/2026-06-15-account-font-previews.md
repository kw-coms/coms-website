# Account Font Persistence And Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist built-in font choices for members and preview fonts in member and admin settings.

**Architecture:** Keep uploaded font IDs and built-in font keys as separate nullable fields, with server validation enforcing mutual exclusion. Share frontend font metadata and CSS helpers so the app shell, settings page, and admin page render fonts consistently.

**Tech Stack:** React, Playwright, Spring Boot, JPA, Flyway, JUnit

---

### Task 1: Backend Font Preference Contract

**Files:**
- Modify: `backend/src/main/java/com/coms/backend/domain/Member.java`
- Modify: `backend/src/main/java/com/coms/backend/dto/UpdateProfileRequest.java`
- Modify: `backend/src/main/java/com/coms/backend/dto/MemberResponse.java`
- Modify: `backend/src/main/java/com/coms/backend/service/FontService.java`
- Modify: `backend/src/main/java/com/coms/backend/service/AuthService.java`
- Modify: `backend/src/main/java/com/coms/backend/service/AdminService.java`
- Create: `backend/src/main/resources/db/migration/V40__member_builtin_font_preference.sql`
- Test: `backend/src/test/java/com/coms/backend/service/AuthServiceTest.java`

- [ ] Write failing tests for saving a built-in key, rejecting unknown keys, and rejecting simultaneous uploaded/built-in choices.
- [ ] Run focused backend tests and confirm the new tests fail.
- [ ] Add the new field, migration, DTO properties, response mapping, and server validation.
- [ ] Run focused backend tests and confirm they pass.

### Task 2: Shared Frontend Font Preferences

**Files:**
- Create: `src/services/fontPreferences.js`
- Modify: `src/App.jsx`
- Modify: `src/pages/ChangePassword.jsx`
- Test: `tests/e2e/app-smoke.spec.js`

- [ ] Write a failing smoke test that saves `b:pretendard` and expects `selectedBuiltinFontKey`.
- [ ] Extract built-in font metadata and safe font CSS helpers for reuse.
- [ ] Render built-in and uploaded options in account settings, submit the correct field pair, and show a live selected-font preview.
- [ ] Run the focused smoke test and confirm it passes.

### Task 3: Admin Font Previews

**Files:**
- Modify: `src/pages/Admin.jsx`
- Test: `tests/e2e/app-smoke.spec.js`

- [ ] Extend the admin font smoke test to require a live preview for active and inactive fonts.
- [ ] Inject safe admin font faces and render preview text in each font row.
- [ ] Run the focused admin smoke test and confirm it passes.

### Task 4: Verification And Merge

**Files:**
- Verify all modified files.

- [ ] Run `./gradlew test` in `backend`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run smoke`.
- [ ] Run `git diff --check`.
- [ ] Commit using the Lore protocol, push, create a PR, verify checks, and merge.
