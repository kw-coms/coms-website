# Calendar And Apps Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add date-schedule edit/delete, month summary, recurring one-date exceptions, CSV schedule import, and Apps admin card previews/status badges.

**Architecture:** Keep one-off date schedules on `ClubActivity` and add a focused `RecurringScheduleException` backend model for per-date recurring overrides. Keep CSV parsing and app status classification in frontend utility modules, then wire them into the existing React admin surfaces.

**Tech Stack:** React/Vite, Spring Boot, JPA/Flyway, node assertion tests, JUnit service tests, Playwright smoke tests.

## Global Constraints

- No new dependencies.
- Do not invent fake schedule/app data.
- Public `/apps` card design remains the same by default.
- Calendar admin schedule inputs stay title/date/time focused.
- Recurring cancellations remain visible as canceled occurrences so members know the schedule was intentionally canceled.

---

### Task 1: Frontend Utility Contracts

**Files:**
- Modify: `src/utils/monthlyCalendar.js`
- Create: `src/utils/scheduleCsv.js`
- Create: `src/utils/appProjectStatus.js`
- Modify: `tests/monthlyCalendar.test.mjs`
- Create: `tests/scheduleCsv.test.mjs`
- Create: `tests/appProjectStatus.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `buildMonthEventSummary({ eventsByDay, calendarMonth, today, limit })`
- `parseScheduleCsv(text)`
- `buildProjectStatusBadges(project)`

- [ ] Add failing tests for three-item month summaries, canceled/overridden recurring events, CSV row parsing, and Apps status badges.
- [ ] Implement utilities with no dependencies.
- [ ] Add new utility tests to `npm test`.

### Task 2: Recurring Exception Backend

**Files:**
- Create: `backend/src/main/java/com/coms/backend/domain/RecurringScheduleException.java`
- Create: `backend/src/main/java/com/coms/backend/repository/RecurringScheduleExceptionRepository.java`
- Create: `backend/src/main/java/com/coms/backend/dto/RecurringScheduleExceptionRequest.java`
- Create: `backend/src/main/java/com/coms/backend/dto/RecurringScheduleExceptionResponse.java`
- Modify: `backend/src/main/java/com/coms/backend/dto/ScheduleOccurrenceResponse.java`
- Modify: `backend/src/main/java/com/coms/backend/service/RecurringScheduleService.java`
- Modify: `backend/src/main/java/com/coms/backend/controller/RecurringScheduleController.java`
- Modify: `backend/src/test/java/com/coms/backend/service/RecurringScheduleServiceTest.java`
- Create: `backend/src/main/resources/db/migration/V66__recurring_schedule_exceptions.sql`

**Interfaces:**
- `PUT /api/admin/recurring-schedules/{id}/exceptions/{date}`
- `DELETE /api/admin/recurring-schedules/{id}/exceptions/{date}`
- `ScheduleOccurrenceResponse.exceptionId`
- `ScheduleOccurrenceResponse.canceled`

- [ ] Add failing service test for canceled and time-overridden occurrences.
- [ ] Add entity/repository/migration.
- [ ] Apply exception overlays in `occurrencesForMonth`.
- [ ] Add controller endpoints.

### Task 3: Calendar Admin UX

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/services/clubActivityApi.js`
- Modify: `src/index.css`
- Modify: `tests/e2e/app-smoke.spec.js`

**Interfaces:**
- Use `updateClubActivity` and `deleteClubActivity` for one-off schedules.
- Add `upsertRecurringScheduleException` and `deleteRecurringScheduleException`.
- Use `parseScheduleCsv` for bulk import.

- [ ] Add smoke expectations for date schedule edit/delete and month summary.
- [ ] Wire date edit/delete controls into selected-day details.
- [ ] Add recurring exception controls and inline time editor.
- [ ] Add CSV import panel and batch create behavior.
- [ ] Style summary cards, edit actions, canceled events, exception editor, and CSV panel.

### Task 4: Apps Admin Preview

**Files:**
- Create: `src/components/apps/AppProjectCard.jsx`
- Modify: `src/components/home/CompanionServicesSection.jsx`
- Modify: `src/pages/Admin.jsx`
- Modify: `tests/e2e/app-smoke.spec.js`

**Interfaces:**
- Public `/apps` uses `<AppProjectCard />` with default props.
- Admin uses `<AppProjectCard showStatusBadges />`.

- [ ] Move public card markup into shared component without changing default public rendering.
- [ ] Add admin preview next to/under the form and row editor.
- [ ] Show status badges only in admin preview.

### Task 5: Verification And Delivery

**Files:**
- Modify: `backend/openapi.json`

- [ ] Regenerate `backend/openapi.json`.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm run smoke`.
- [ ] Run `./gradlew test`.
- [ ] Commit, push PR, merge, and verify deployment on `ssh kw@coms`.
