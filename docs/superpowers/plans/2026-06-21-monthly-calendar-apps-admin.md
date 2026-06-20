# Monthly Calendar Apps Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Monthly calendar schedule creation title-first, support date/recurring selection, continuous date ranges, optional times, readable multi-event calendar rendering, and expose Apps management without changing the public card design.

**Architecture:** Keep existing `ClubActivity` one-off schedule records and `RecurringSchedule` definitions, but extend one-off schedules with optional `endDate`, `startTime`, and `endTime`. The calendar composer becomes a single admin surface that branches between one-off range schedules and recurring schedules while hiding category/location/description fields. Apps management reuses the existing `club-projects` CRUD that already feeds `/apps`.

**Tech Stack:** React/Vite frontend, Spring Boot backend, Flyway migrations, JUnit service tests.

## Global Constraints

- No new dependencies.
- Do not invent dummy schedules or app examples.
- Keep the existing Apple-like public `/apps` card design intact.
- Calendar schedule input must ask only for title, dates/recurrence, and optional time.
- Calendar event category selection must be removed from this flow.
- Location and memo/description must not be shown in the calendar schedule composer.
- One-off and recurring schedules must both support continuous date ranges.
- Multiple events must not make date-cell text unreadable.

---

### Task 1: Extend One-Off Schedule Data

**Files:**
- Modify: `backend/src/main/java/com/coms/backend/domain/ClubActivity.java`
- Modify: `backend/src/main/java/com/coms/backend/dto/ClubActivityResponse.java`
- Modify: `backend/src/main/java/com/coms/backend/service/ClubActivityService.java`
- Modify: `backend/src/main/java/com/coms/backend/controller/ClubActivityController.java`
- Modify: `backend/src/test/java/com/coms/backend/service/ClubActivityServiceTest.java`
- Create: `backend/src/main/resources/db/migration/V64__club_activity_schedule_ranges.sql`

**Interfaces:**
- Consumes: existing `ClubActivityService.create(...)` and `update(...)`.
- Produces: `ClubActivityResponse.endDate()`, `startTime()`, and `endTime()` for SCHEDULE records.

- [ ] Add a failing test that creates a SCHEDULE from `2026-06-01` to `2026-06-03` with `18:30~20:00` and asserts the response carries `eventDate`, `endDate`, `startTime`, and `endTime`.
- [ ] Run the targeted backend test and confirm it fails before production edits.
- [ ] Add nullable `end_date`, `start_time`, and `end_time` columns with a migration; backfill `end_date = event_date`.
- [ ] Add entity fields, DTO fields, controller params, service validation, and response mapping.
- [ ] Preserve old behavior by defaulting missing `endDate` to `eventDate`.
- [ ] Reject `endDate < eventDate` and `endTime < startTime`.

### Task 2: Replace Split Calendar Admin Forms With One Composer

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/services/clubActivityApi.js`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `createClubActivity({ kind, title, eventDate, endDate, startTime, endTime })`.
- Consumes: `createRecurringSchedule({ title, startDate, endDate, daysOfWeek, startTime, endTime })`.
- Produces: one admin composer that starts with `날짜 일정` / `정기 일정` selection.

- [ ] Update the frontend API helper to append optional `endDate`, `startTime`, and `endTime`.
- [ ] Remove calendar category, location, and memo inputs from the calendar composer.
- [ ] Keep a single composer shell and change only the date/recurrence controls by selected type.
- [ ] After save, keep type and time fields for quick repeated entry, clear title and date range fields.
- [ ] Keep recurring schedule list edit/delete support, but edit inside the unified composer.

### Task 3: Render Ranges And Crowded Days Readably

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `eventDate`, `endDate`, `startTime`, `endTime`, and recurring occurrences.
- Produces: calendar day cells with soft range tint, short labels, and overflow counts.

- [ ] Expand one-off schedule ranges into each visible day without duplicating long text aggressively.
- [ ] Render range events with soft category-neutral tint and segment classes for start/middle/end/single.
- [ ] Show title on start day or first visible day; middle days can show a thin continuation label.
- [ ] Show at most three visible items in a day cell and a `+N개` overflow button.
- [ ] Add a selected-day detail panel below the grid for overflow/full day inspection.

### Task 4: Make Apps Management Match The Apps Surface

**Files:**
- Modify: `src/pages/Admin.jsx`
- Modify: `src/components/home/CompanionServicesSection.jsx` only if copy needs alignment.

**Interfaces:**
- Consumes: existing `club-projects` APIs, because `/apps` already renders from `listClubProjects()`.
- Produces: admin wording that clearly says `Apps 관리`, while preserving public card markup.

- [ ] Rename the admin tab label from project-only wording to Apps/project wording.
- [ ] Adjust form copy to say the entries appear in `COM's Apps`.
- [ ] Keep fields that affect data only; do not expose layout/style controls.
- [ ] Keep existing add, edit, delete, and file upload behavior.

### Task 5: Verify

**Files:**
- Test command targets only.

**Interfaces:**
- Produces: local validation evidence.

- [ ] Run backend targeted tests for `ClubActivityServiceTest` and `RecurringScheduleServiceTest`.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
