-- Who/where a media row was detached from: re-attach by a non-uploader is limited to the original
-- owner, and rows the uploader detached themselves still count toward their pending quota.
ALTER TABLE rich_body_media ADD COLUMN detached_from_owner_id BIGINT;
ALTER TABLE rich_body_media ADD COLUMN detached_by_id BIGINT REFERENCES members(id) ON DELETE SET NULL;
-- Backs the ON DELETE SET NULL scan. Plain (not partial): H2 cannot parse partial indexes and every
-- migration here stays portable across H2 (PostgreSQL mode) and PostgreSQL.
CREATE INDEX IF NOT EXISTS idx_rich_body_media_detached_by ON rich_body_media (detached_by_id);
