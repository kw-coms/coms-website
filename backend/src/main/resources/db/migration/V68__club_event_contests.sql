CREATE TABLE club_events (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    description TEXT,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    created_by_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_club_events_created_at ON club_events(created_at DESC);

CREATE TABLE club_event_entries (
    id BIGSERIAL PRIMARY KEY,
    club_event_id BIGINT NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    author_name VARCHAR(100),
    description TEXT,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_club_event_entries_event_id ON club_event_entries(club_event_id);

CREATE TABLE club_event_votes (
    id BIGSERIAL PRIMARY KEY,
    club_event_id BIGINT NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
    entry_id BIGINT NOT NULL REFERENCES club_event_entries(id) ON DELETE CASCADE,
    student_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_club_event_votes_event_student UNIQUE (club_event_id, student_id)
);

CREATE INDEX idx_club_event_votes_event_id ON club_event_votes(club_event_id);
CREATE INDEX idx_club_event_votes_entry_id ON club_event_votes(entry_id);
