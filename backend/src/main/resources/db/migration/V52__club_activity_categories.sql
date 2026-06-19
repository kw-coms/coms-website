-- Admin-managed club activity categories (replaces the hardcoded Java enum).
-- The club_activities.category column keeps its string key so existing rows and
-- API responses remain backward-compatible.
CREATE TABLE club_activity_categories (
    id BIGSERIAL PRIMARY KEY,
    category_key VARCHAR(40) NOT NULL,
    name VARCHAR(60) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_club_activity_categories_key UNIQUE (category_key)
);

-- Seed with the current enum values so nothing breaks for existing activities.
INSERT INTO club_activity_categories (category_key, name, position) VALUES
    ('GENERAL', '일반', 0),
    ('SEMINAR', '세미나', 1),
    ('STUDY', '스터디', 2),
    ('PROJECT', '프로젝트', 3),
    ('MEETING', '회의', 4),
    ('RECRUIT', '모집', 5),
    ('EVENT', '행사', 6),
    ('MT', 'MT', 7),
    ('ACHIEVEMENT', '성과', 8);
