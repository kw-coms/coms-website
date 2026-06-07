CREATE TABLE community_post_videos (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(100),
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_community_post_videos_post_id ON community_post_videos(post_id);
