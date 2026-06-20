-- Admin-managed "COMS Apps" hub. Replaces the previously hardcoded
-- companionServices constant in the member app with a backend catalog so
-- admins can add/edit/delete entries. Seeded with the original 5 services.
CREATE TABLE app_catalog_entries (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    eyebrow VARCHAR(60),
    body TEXT,
    href VARCHAR(500),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_app_catalog_entries_sort ON app_catalog_entries(sort_order, id);

INSERT INTO app_catalog_entries (title, eyebrow, body, href, sort_order) VALUES
    ('Food Club', 'Meal loop', '부원들과 밥 약속과 맛집 후보를 모읍니다.', 'https://coms.kw.ac.kr/foodclub/', 0),
    ('TeamMate', 'Team randomizer', '스터디와 프로젝트 팀을 조건에 맞춰 나눕니다.', 'https://coms.kw.ac.kr/team-randomizer/', 1),
    ('Game Club', 'Playground', '동아리 안에서 함께 즐길 작은 게임 공간입니다.', 'https://coms.kw.ac.kr/gameclub/', 2),
    ('KW Mate', 'Campus utility', '광운대 생활 연결과 정보를 빠르게 찾습니다.', 'https://kwmate.com/', 3),
    ('Daily Coding', 'Practice', '매일 코딩 문제와 학습 루틴을 이어갑니다.', 'https://dailycoding-final.com/', 4);
