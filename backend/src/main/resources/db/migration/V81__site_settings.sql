CREATE TABLE IF NOT EXISTS site_settings (
    id BIGINT PRIMARY KEY,
    semester_label VARCHAR(120) NOT NULL,
    recruitment_status VARCHAR(120) NOT NULL,
    recruitment_period VARCHAR(240) NOT NULL,
    home_hero_title VARCHAR(120) NOT NULL,
    home_hero_copy VARCHAR(500) NOT NULL,
    contact_links_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_settings (
    id,
    semester_label,
    recruitment_status,
    recruitment_period,
    home_hero_title,
    home_hero_copy,
    contact_links_json,
    created_at,
    updated_at
) SELECT
    1,
    '2026 Semester Ready',
    '모집 안내',
    '상세 일정은 COM''s 공식 채널과 학내 공지를 통해 안내됩니다.',
    'COM''s',
    '배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.',
    '[{"label":"Mail","href":"mailto:kwcoms69@gmail.com"}]',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM site_settings
    WHERE id = 1
);
