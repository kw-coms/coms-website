CREATE TABLE rich_body_media (
    id BIGSERIAL PRIMARY KEY,
    kind VARCHAR(10) NOT NULL,
    scope VARCHAR(10) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    uploader_id BIGINT REFERENCES members(id) ON DELETE SET NULL,
    owner_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attached_at TIMESTAMP
);
CREATE INDEX idx_rich_body_media_orphans ON rich_body_media(owner_id, created_at);
CREATE INDEX idx_rich_body_media_owner ON rich_body_media(scope, owner_id);
