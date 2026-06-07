CREATE TABLE community_post_files (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_community_post_files_post_id ON community_post_files(post_id, position);
