CREATE TABLE community_post_images (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(100),
    position INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT fk_cpi_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE
);
CREATE INDEX idx_cpi_post_id ON community_post_images(post_id, position);
