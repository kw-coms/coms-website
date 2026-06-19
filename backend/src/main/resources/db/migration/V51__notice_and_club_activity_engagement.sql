ALTER TABLE notices ADD COLUMN view_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE club_activities ADD COLUMN view_count BIGINT NOT NULL DEFAULT 0;

CREATE TABLE notice_votes (
    id BIGSERIAL PRIMARY KEY,
    notice_id BIGINT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL,
    vote_value INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_notice_votes_notice_student UNIQUE (notice_id, student_id)
);

CREATE INDEX idx_notice_votes_notice_id ON notice_votes(notice_id);

CREATE TABLE club_activity_votes (
    id BIGSERIAL PRIMARY KEY,
    club_activity_id BIGINT NOT NULL REFERENCES club_activities(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL,
    vote_value INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_club_activity_votes_activity_student UNIQUE (club_activity_id, student_id)
);

CREATE INDEX idx_club_activity_votes_activity_id ON club_activity_votes(club_activity_id);
