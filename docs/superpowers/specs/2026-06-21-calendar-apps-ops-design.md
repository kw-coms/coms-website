# Calendar And Apps Ops Design

## Scope

This builds the next operational layer on top of the existing Monthly calendar and Apps admin work:

- Admins can edit/delete one-off date schedules from the calendar.
- The calendar shows a three-item month summary.
- Recurring schedules support one-date exceptions for cancellation or time override.
- Admins can bulk import semester schedules from CSV.
- Apps admin shows the same public card preview and simple status badges.

## Calendar Behavior

Date schedule rows continue to use `ClubActivity` records with `kind=SCHEDULE`. The selected-day detail panel exposes admin-only edit/delete controls for those rows. Editing reuses the existing unified calendar composer, switches it to date mode, and saves through `PATCH /api/club-activities/{id}`. Deleting uses the existing `DELETE /api/club-activities/{id}` endpoint and removes the cached row.

The month summary is derived from the same expanded calendar event map as the grid. It lists up to three upcoming visible events for the selected month, preferring today-or-later when the selected month is the current month. Multi-day ranges appear once at their first visible day.

## Recurring Exceptions

Recurring exceptions are stored in a new `recurring_schedule_exceptions` table with one row per `(recurring_schedule_id, exception_date)`. Each exception can either mark the occurrence as canceled or override `startTime`/`endTime`. Canceled occurrences remain in the API response and calendar with a canceled badge so members can see that the meeting was intentionally canceled instead of missing.

Admin controls live in the selected-day detail panel for recurring events:

- `이번 일정 취소` creates/updates an exception with `canceled=true`.
- `시간 변경` opens a compact time editor for that occurrence.
- `예외 해제` deletes the exception when an occurrence already has a cancellation or override.

## CSV Import

CSV import is frontend-only and calls the existing create endpoints row by row. Required columns are `type,title,startDate`; optional columns are `endDate,startTime,endTime,daysOfWeek`. `type=date` creates a one-off schedule. `type=recurring` requires `endDate` and `daysOfWeek`; weekdays are separated with `|`, `/`, or spaces so the CSV comma delimiter stays unambiguous. Korean headers are also accepted.

## Apps Preview

The public Apps card markup is extracted into a shared component and reused by `/apps` and the admin preview. The admin preview turns on badges that describe the app delivery state: `열기 가능`, `다운로드`, `COMS 호스팅`, `외부 링크`, or `준비 중`. Public card design stays unchanged by default.

## Verification

Backend service tests cover recurring exception expansion. Frontend utility tests cover month summaries, canceled/overridden occurrence mapping, CSV parsing, and Apps badge classification. Existing smoke tests continue to validate the admin calendar form and `/apps` rendering.
