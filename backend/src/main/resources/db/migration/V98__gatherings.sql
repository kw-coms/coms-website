-- Gatherings ("모임 신청"): a member opens one for a study, an outing or a dinner, and other
-- members put their names down while it is open.
-- Two new tables; nothing that exists is altered.

CREATE TABLE gatherings (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(1000),
    -- How many may sign up. NULL: no limit.
    capacity INTEGER,
    -- What each member is asked to add ("티셔츠 사이즈"). NULL: nothing is asked.
    note_label VARCHAR(40),
    -- When sign-up stops by itself. NULL: open until it is closed by hand.
    closes_at TIMESTAMP,
    closed_at TIMESTAMP,
    creator_student_id VARCHAR(50) NOT NULL,
    creator_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gatherings_created ON gatherings(created_at DESC);
CREATE INDEX idx_gatherings_creator ON gatherings(creator_student_id);

CREATE TABLE gathering_signups (
    id BIGSERIAL PRIMARY KEY,
    gathering_id BIGINT NOT NULL REFERENCES gatherings(id) ON DELETE CASCADE,
    student_id VARCHAR(50) NOT NULL,
    member_name VARCHAR(100) NOT NULL,
    note VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_gathering_signup_member UNIQUE (gathering_id, student_id)
);

CREATE INDEX idx_gathering_signups_student ON gathering_signups(student_id);
