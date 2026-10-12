-- Meeting polls ("일정 조율"): members mark when they are free on a shared grid of dates and
-- half-hour slots, and the page shows when the most people can meet.
-- Two new tables; nothing that exists is altered.

CREATE TABLE meeting_polls (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    creator_student_id VARCHAR(50) NOT NULL,
    creator_name VARCHAR(100) NOT NULL,
    -- ISO dates, sorted, comma separated ("2026-10-14,2026-10-15").
    dates TEXT NOT NULL,
    -- The part of each day on offer, in minutes from midnight.
    start_minute INTEGER NOT NULL,
    end_minute INTEGER NOT NULL,
    slot_minutes INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_meeting_polls_created ON meeting_polls(created_at DESC);
CREATE INDEX idx_meeting_polls_creator ON meeting_polls(creator_student_id);

CREATE TABLE meeting_poll_availabilities (
    id BIGSERIAL PRIMARY KEY,
    poll_id BIGINT NOT NULL REFERENCES meeting_polls(id) ON DELETE CASCADE,
    student_id VARCHAR(50) NOT NULL,
    member_name VARCHAR(100) NOT NULL,
    -- One character per slot, day after day: '1' free, '0' not.
    slots TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_meeting_poll_availability_member UNIQUE (poll_id, student_id)
);

CREATE INDEX idx_meeting_poll_availabilities_student ON meeting_poll_availabilities(student_id);
