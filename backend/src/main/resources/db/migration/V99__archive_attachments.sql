CREATE TABLE archive_attachments (
    id BIGSERIAL PRIMARY KEY,
    archive_file_id BIGINT NOT NULL REFERENCES archive_files(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size >= 0),
    position INTEGER NOT NULL CHECK (position >= 0)
);

CREATE INDEX idx_archive_attachments_file_position ON archive_attachments(archive_file_id, position);

-- Keep the original parent blob and all existing post IDs/titles intact.
INSERT INTO archive_attachments (archive_file_id, original_name, stored_name, mime_type, file_size, position)
SELECT id, original_name, stored_name, mime_type, file_size, 0 FROM archive_files;
