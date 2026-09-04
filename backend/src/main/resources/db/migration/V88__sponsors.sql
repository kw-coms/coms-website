-- 후원자(Sponsors) — 공개 페이지 + 회장 전용 관리 탭.
--
-- NOT NULL 컬럼에는 DEFAULT 를 붙인다 — 엔티티의 columnDefinition 과 짝을 이뤄
-- hibernate 가 만든 스키마 위에 이 스크립트를 재생해도(LatestMigrationsSmokeTest)
-- 깨지지 않게 한다. 페이지 설정 JSON 은 site_settings.contact_links_json 과 같이
-- TEXT 로 저장한다: 테스트는 H2(PostgreSQL 모드)에서 돌고 H2 에는 jsonb 가 없다.

CREATE TABLE IF NOT EXISTS sponsor_tiers (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    color VARCHAR(16) NOT NULL DEFAULT '#9ca3af',
    sort_order INT NOT NULL DEFAULT 0,
    description VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sponsor_images (
    id BIGSERIAL PRIMARY KEY,
    storage_key VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    mime VARCHAR(60) NOT NULL DEFAULT 'image/png',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    width INT,
    height INT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sponsors (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    tier_id BIGINT,
    logo_image_id BIGINT,
    link_url VARCHAR(500),
    description TEXT,
    -- 금액 메모는 회장 전용 장부 항목 — 공개 응답에는 절대 포함하지 않는다.
    amount_note VARCHAR(120),
    since_date DATE,
    until_date DATE,
    anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sponsors_tier ON sponsors (tier_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_sponsors_visible ON sponsors (visible);

CREATE TABLE IF NOT EXISTS sponsor_page_settings (
    id INT PRIMARY KEY,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sponsor_page_settings (id, settings, created_at, updated_at)
SELECT 1, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM sponsor_page_settings WHERE id = 1);

INSERT INTO sponsor_tiers (name, color, sort_order, description, created_at, updated_at)
SELECT '플래티넘', '#8a94a6', 1, '동아리 운영을 폭넓게 지원해주신 후원자입니다.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM sponsor_tiers);

INSERT INTO sponsor_tiers (name, color, sort_order, description, created_at, updated_at)
SELECT '골드', '#d4a017', 2, '정기 활동을 후원해주신 후원자입니다.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM sponsor_tiers WHERE name = '골드');

INSERT INTO sponsor_tiers (name, color, sort_order, description, created_at, updated_at)
SELECT '실버', '#9ca3af', 3, '함께해주신 모든 후원자입니다.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM sponsor_tiers WHERE name = '실버');
