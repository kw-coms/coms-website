CREATE TABLE community_post_bookmarks (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_community_post_bookmarks_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
    CONSTRAINT uk_community_post_bookmarks_post_student UNIQUE (post_id, student_id)
);
CREATE INDEX idx_community_post_bookmarks_student ON community_post_bookmarks(student_id, created_at DESC);
