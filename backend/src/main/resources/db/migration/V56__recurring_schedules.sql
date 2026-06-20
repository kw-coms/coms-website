-- Recurring (repeating) club schedules for the monthly calendar.
-- Each row defines a schedule that recurs on one or more weekdays across a
-- [start_date, end_date] range; the calendar expands it into occurrences per
-- displayed month. Weekdays are stored as a compact CSV of java.time.DayOfWeek
-- names (e.g. 'MONDAY,WEDNESDAY,FRIDAY'). The optional category reuses the
-- admin-managed club_activity_categories.category_key string.
CREATE TABLE recurring_schedules (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_of_week VARCHAR(80) NOT NULL,
    start_time TIME,
    end_time TIME,
    location VARCHAR(200),
    category VARCHAR(40),
    created_by VARCHAR(64) NOT NULL,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Speeds up the per-month occurrence expansion query (range overlap).
CREATE INDEX idx_recurring_schedules_range ON recurring_schedules (start_date, end_date);
