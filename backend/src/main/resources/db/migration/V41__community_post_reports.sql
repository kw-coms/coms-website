CREATE TABLE community_post_reports (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    reporter_student_id VARCHAR(64) NOT NULL,
    reason VARCHAR(64) NOT NULL,
    detail VARCHAR(500),
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    resolved_by_student_id VARCHAR(64),
    resolution_note VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP
);

CREATE INDEX idx_post_reports_post_id ON community_post_reports(post_id);
CREATE INDEX idx_post_reports_status ON community_post_reports(status, created_at DESC);
CREATE UNIQUE INDEX uq_post_report_per_reporter ON community_post_reports(post_id, reporter_student_id)
    WHERE status = 'OPEN';
