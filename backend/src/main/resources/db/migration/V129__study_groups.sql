CREATE TABLE study_groups (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    topic_tags VARCHAR(500),
    leader_student_id VARCHAR(50) NOT NULL,
    term VARCHAR(40) NOT NULL,
    schedule_text VARCHAR(200),
    place VARCHAR(200),
    capacity INTEGER,
    status VARCHAR(20) NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_study_capacity CHECK (capacity IS NULL OR capacity > 0)
);
CREATE INDEX idx_study_groups_status ON study_groups(status, created_at DESC);

CREATE TABLE study_group_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    student_id VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_study_group_member UNIQUE (group_id, student_id)
);
CREATE INDEX idx_study_group_members_student ON study_group_members(student_id);

CREATE TABLE study_interests (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    student_id VARCHAR(50) NOT NULL,
    preferred_slots VARCHAR(400),
    level VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_study_interest UNIQUE (group_id, student_id)
);
CREATE INDEX idx_study_interests_group ON study_interests(group_id);
