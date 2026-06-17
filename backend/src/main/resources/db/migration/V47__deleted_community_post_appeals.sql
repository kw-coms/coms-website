CREATE TABLE deleted_community_post_appeals (
    id BIGSERIAL PRIMARY KEY,
    deleted_post_id BIGINT NOT NULL REFERENCES deleted_community_posts(id) ON DELETE CASCADE,
    requester_student_id VARCHAR(64) NOT NULL,
    requester_name VARCHAR(100) NOT NULL,
    message VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by_student_id VARCHAR(64),
    resolution_note VARCHAR(500)
);

CREATE INDEX idx_deleted_post_appeals_deleted_post_id ON deleted_community_post_appeals(deleted_post_id);
CREATE INDEX idx_deleted_post_appeals_requester ON deleted_community_post_appeals(requester_student_id);
CREATE INDEX idx_deleted_post_appeals_status ON deleted_community_post_appeals(status);
