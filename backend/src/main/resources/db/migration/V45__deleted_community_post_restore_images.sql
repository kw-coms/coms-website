ALTER TABLE deleted_community_posts
    ADD COLUMN IF NOT EXISTS restored_post_id BIGINT;

ALTER TABLE deleted_community_posts
    ADD COLUMN IF NOT EXISTS restored_by_student_id VARCHAR(64);

ALTER TABLE deleted_community_posts
    ADD COLUMN IF NOT EXISTS restored_by_name VARCHAR(100);

ALTER TABLE deleted_community_posts
    ADD COLUMN IF NOT EXISTS restored_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS deleted_community_post_images (
    id BIGSERIAL PRIMARY KEY,
    deleted_post_id BIGINT NOT NULL,
    original_image_id BIGINT,
    kind VARCHAR(20) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(100),
    position INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT fk_deleted_cpi_deleted_post
        FOREIGN KEY (deleted_post_id) REFERENCES deleted_community_posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deleted_cpi_deleted_post_id
    ON deleted_community_post_images(deleted_post_id, position);

CREATE INDEX IF NOT EXISTS idx_deleted_cpi_original_image_id
    ON deleted_community_post_images(original_image_id);

CREATE INDEX IF NOT EXISTS idx_deleted_cpi_stored_name
    ON deleted_community_post_images(stored_name);
