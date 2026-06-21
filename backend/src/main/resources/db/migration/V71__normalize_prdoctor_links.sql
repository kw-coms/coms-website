UPDATE club_projects
SET link_url = 'https://coms.kw.ac.kr/PRDoctor',
    display_url = 'coms.kw.ac.kr/PRDoctor',
    updated_at = CURRENT_TIMESTAMP
WHERE title = 'PRDoctor'
  AND link_url = 'https://coms.kw.ac.kr/PRDoctor/';

UPDATE app_catalog_entries
SET href = 'https://coms.kw.ac.kr/PRDoctor'
WHERE title = 'PRDoctor'
  AND href = 'https://coms.kw.ac.kr/PRDoctor/';
