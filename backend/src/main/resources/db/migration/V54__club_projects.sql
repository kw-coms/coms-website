-- Admin-managed "동아리 부원들이 만든 프로젝트 모음" (collection of projects built by
-- club members). Mirrors the club_activity_categories pattern: a category table
-- with string keys plus a projects table that references the key, and a child
-- table for downloadable distributables (apk/zip for apps and games).

CREATE TABLE club_project_categories (
    id BIGSERIAL PRIMARY KEY,
    category_key VARCHAR(40) NOT NULL,
    name VARCHAR(60) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_club_project_categories_key UNIQUE (category_key)
);

-- Seed the three default project categories: websites, apps, games.
INSERT INTO club_project_categories (category_key, name, position) VALUES
    ('WEBSITE', '웹사이트', 0),
    ('APP', '앱', 1),
    ('GAME', '게임', 2);

CREATE TABLE club_projects (
    id BIGSERIAL PRIMARY KEY,
    category VARCHAR(40) NOT NULL,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    eyebrow VARCHAR(60),
    made_by VARCHAR(100) NOT NULL,
    link_url VARCHAR(500),
    display_url VARCHAR(255),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_club_projects_category ON club_projects(category);
CREATE INDEX idx_club_projects_position ON club_projects(position, id);

CREATE TABLE club_project_files (
    id BIGSERIAL PRIMARY KEY,
    club_project_id BIGINT NOT NULL REFERENCES club_projects(id) ON DELETE CASCADE,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_club_project_files_project_id ON club_project_files(club_project_id);

-- Seed migration: bring the previously hardcoded companionServices entries into
-- club_projects rows. Game Club -> 게임, everything else -> 웹사이트. Every entry
-- was built by 최준혁, so madeBy defaults to that for all migrated rows.
INSERT INTO club_projects (category, title, description, eyebrow, made_by, link_url, display_url, position) VALUES
    ('WEBSITE', 'COMS 월드컵', '둘 중 하나를 고르며 개발 언어, 야식, 밈, 세미나 주제의 최종 우승자를 뽑는 COMS 미니게임입니다.', 'Worldcup', '최준혁', 'https://coms.kw.ac.kr/worldcup/', 'coms.kw.ac.kr/worldcup', 0),
    ('WEBSITE', 'COMS 티어표', '언어, 프레임워크, 프로젝트, 활동 주제를 S/A/B/C/D로 나누고 공유하는 COMS 티어표 도구입니다.', 'Tier board', '최준혁', 'https://coms.kw.ac.kr/tier/', 'coms.kw.ac.kr/tier', 1),
    ('WEBSITE', 'Food Club', '부원들과 밥 약속과 맛집 후보를 가볍게 모으는 식사 모임 허브입니다.', 'Meal loop', '최준혁', 'https://coms.kw.ac.kr/foodclub/', 'coms.kw.ac.kr/foodclub', 2),
    ('WEBSITE', 'TeamMate', '스터디와 프로젝트 팀을 조건에 맞춰 빠르게 나누는 팀 편성 도구입니다.', 'Team randomizer', '최준혁', 'https://coms.kw.ac.kr/team-randomizer/', 'coms.kw.ac.kr/team-randomizer', 3),
    ('GAME', 'Game Club', '동아리 안에서 함께 즐길 수 있는 작은 게임과 이벤트 공간입니다.', 'Playground', '최준혁', 'https://coms.kw.ac.kr/gameclub/', 'coms.kw.ac.kr/gameclub', 4),
    ('WEBSITE', 'KW Mate', '광운대 생활에 필요한 연결과 정보를 더 쉽게 찾도록 돕는 서비스입니다.', 'Campus utility', '최준혁', 'http://kwmate.com/', 'kwmate.com', 5),
    ('WEBSITE', 'Daily Coding', '매일 코딩 문제와 기록을 이어가며 학습 루틴을 만드는 연습 공간입니다.', 'Practice', '최준혁', 'https://dailycoding-final.com/', 'dailycoding-final.com', 6),
    ('WEBSITE', 'BugSnap', '오류 화면 스크린샷을 올리면 OCR로 텍스트를 추출해 GitHub Issue용 버그 리포트 초안을 만들어주는 도구입니다.', 'Bug report', '최준혁', 'https://coms.kw.ac.kr/BugSnap/', 'coms.kw.ac.kr/BugSnap', 7),
    ('WEBSITE', 'LogDoctor', '서버 에러 로그를 붙여넣으면 원인 후보와 확인·해결 절차를 정리해주는 개발자용 로그 분석 도구입니다.', 'Log triage', '최준혁', 'https://coms.kw.ac.kr/LogDoctor/', 'coms.kw.ac.kr/LogDoctor', 8);
