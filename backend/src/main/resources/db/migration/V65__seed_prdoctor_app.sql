-- Add PRDoctor to both COMS Apps catalogs. The guards keep this safe if an
-- admin already registered the project manually before this migration deploys.
INSERT INTO club_projects (category, title, description, eyebrow, made_by, link_url, display_url, position)
SELECT 'WEBSITE',
       'PRDoctor',
       'GitHub PR 링크를 넣으면 변경 요약, 위험도, 보안 경고, 테스트 목록, 리뷰 코멘트 초안을 정리해주는 코드 리뷰 보조 도구입니다.',
       'PR review',
       '최준혁',
       'https://coms.kw.ac.kr/PRDoctor/',
       'coms.kw.ac.kr/PRDoctor',
       11
WHERE NOT EXISTS (
    SELECT 1 FROM club_projects WHERE title = 'PRDoctor'
);

INSERT INTO app_catalog_entries (title, eyebrow, body, href, sort_order)
SELECT 'PRDoctor',
       'PR review',
       'GitHub PR 링크를 넣으면 리뷰 포인트와 테스트 목록을 정리해주는 개발자 도구입니다.',
       'https://coms.kw.ac.kr/PRDoctor/',
       5
WHERE NOT EXISTS (
    SELECT 1 FROM app_catalog_entries WHERE title = 'PRDoctor'
);
