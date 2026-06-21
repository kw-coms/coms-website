CREATE TABLE club_event_entry_files (
    id BIGSERIAL PRIMARY KEY,
    entry_id BIGINT NOT NULL REFERENCES club_event_entries(id) ON DELETE CASCADE,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_club_event_entry_files_entry_id ON club_event_entry_files(entry_id);

INSERT INTO club_event_entry_files (entry_id, stored_name, original_name, mime_type, file_size, position)
SELECT id, stored_name, original_name, mime_type, file_size, 0
FROM club_event_entries;
