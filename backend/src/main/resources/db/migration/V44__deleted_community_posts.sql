CREATE TABLE IF NOT EXISTS deleted_community_posts (
    id BIGSERIAL PRIMARY KEY,
    original_post_id BIGINT NOT NULL,
    title VARCHAR(120) NOT NULL,
    content TEXT NOT NULL,
    author_student_id VARCHAR(64) NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    category VARCHAR(40) NOT NULL,
    view_count BIGINT NOT NULL DEFAULT 0,
    original_created_at TIMESTAMP NOT NULL,
    original_updated_at TIMESTAMP NOT NULL,
    deleted_by_student_id VARCHAR(64) NOT NULL,
    deleted_by_name VARCHAR(100) NOT NULL,
    deleted_by_role VARCHAR(40) NOT NULL,
    deletion_reason VARCHAR(300) NOT NULL,
    deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deleted_community_posts_deleted_at ON deleted_community_posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deleted_community_posts_original_post_id ON deleted_community_posts(original_post_id);
CREATE INDEX IF NOT EXISTS idx_deleted_community_posts_author_student_id ON deleted_community_posts(author_student_id);
CREATE INDEX IF NOT EXISTS idx_deleted_community_posts_deleted_by_student_id ON deleted_community_posts(deleted_by_student_id);
