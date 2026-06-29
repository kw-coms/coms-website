CREATE TABLE club_event_rsvps (
    id BIGSERIAL PRIMARY KEY,
    club_event_id BIGINT NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
    student_id VARCHAR NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'GOING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_club_event_rsvps_event_student UNIQUE (club_event_id, student_id)
);

CREATE INDEX idx_club_event_rsvps_event ON club_event_rsvps(club_event_id);
