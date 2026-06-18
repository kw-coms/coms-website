CREATE TABLE club_activities (
    id BIGSERIAL PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    category VARCHAR(30) NOT NULL,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    image_original_name VARCHAR(255),
    image_stored_name VARCHAR(255),
    image_mime_type VARCHAR(120),
    image_size BIGINT,
    created_by VARCHAR(64) NOT NULL,
    created_by_name VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_club_activities_event_date ON club_activities(event_date DESC, created_at DESC);
CREATE INDEX idx_club_activities_kind ON club_activities(kind);
