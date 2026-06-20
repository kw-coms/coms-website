-- Game Club is a website (coms.kw.ac.kr/gameclub), not a downloadable game.
-- Recategorize the seeded entry from GAME to WEBSITE. Admins can further edit
-- via the 프로젝트 관리 admin tab.
UPDATE club_projects SET category = 'WEBSITE', updated_at = CURRENT_TIMESTAMP
 WHERE title = 'Game Club' AND category = 'GAME';
