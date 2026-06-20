-- Optional date range and time fields for one-off calendar schedules.
-- Existing activity/schedule rows remain single-day by backfilling end_date.
ALTER TABLE club_activities
    ADD COLUMN end_date DATE,
    ADD COLUMN start_time TIME,
    ADD COLUMN end_time TIME;

UPDATE club_activities
SET end_date = event_date
WHERE end_date IS NULL;

ALTER TABLE club_activities
    ALTER COLUMN end_date SET NOT NULL;
