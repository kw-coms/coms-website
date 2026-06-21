-- One-date overrides for recurring schedules. A row can mark a concrete
-- occurrence as canceled or override its start/end time for that date only.
CREATE TABLE recurring_schedule_exceptions (
    id BIGSERIAL PRIMARY KEY,
    recurring_schedule_id BIGINT NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    canceled BOOLEAN NOT NULL DEFAULT FALSE,
    start_time TIME,
    end_time TIME,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_recurring_schedule_exception_date UNIQUE (recurring_schedule_id, exception_date)
);

CREATE INDEX idx_recurring_schedule_exceptions_month
    ON recurring_schedule_exceptions (recurring_schedule_id, exception_date);
