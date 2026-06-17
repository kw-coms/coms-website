CREATE TABLE IF NOT EXISTS deleted_community_post_media (
    id BIGSERIAL PRIMARY KEY,
    deleted_post_id BIGINT NOT NULL,
    original_media_id BIGINT NOT NULL,
    kind VARCHAR(20) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(100),
    position INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT fk_deleted_cpm_deleted_post
        FOREIGN KEY (deleted_post_id) REFERENCES deleted_community_posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deleted_cpm_deleted_post_id
    ON deleted_community_post_media(deleted_post_id, position);

CREATE INDEX IF NOT EXISTS idx_deleted_cpm_original_media_id
    ON deleted_community_post_media(original_media_id);

CREATE INDEX IF NOT EXISTS idx_deleted_cpm_stored_name
    ON deleted_community_post_media(stored_name);

CREATE TABLE IF NOT EXISTS deleted_community_post_comments (
    id BIGSERIAL PRIMARY KEY,
    deleted_post_id BIGINT NOT NULL,
    original_comment_id BIGINT NOT NULL,
    original_parent_comment_id BIGINT,
    student_id VARCHAR(50) NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    anonymous_name VARCHAR(20),
    ip_address VARCHAR(80),
    content TEXT NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    edited BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_deleted_cpc_deleted_post
        FOREIGN KEY (deleted_post_id) REFERENCES deleted_community_posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deleted_cpc_deleted_post_id
    ON deleted_community_post_comments(deleted_post_id, depth, created_at);

CREATE INDEX IF NOT EXISTS idx_deleted_cpc_original_comment_id
    ON deleted_community_post_comments(original_comment_id);
