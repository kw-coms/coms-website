-- 동아리방 출입 비밀번호. Stored empty by default and set through the admin UI —
-- never seeded in a migration so the real code stays out of the repository.
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS club_room_code VARCHAR(60) NOT NULL DEFAULT '';
