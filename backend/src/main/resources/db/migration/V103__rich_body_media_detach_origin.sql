-- Who/where a media row was detached from: re-attach by a non-uploader is limited to the original
-- owner, and rows the uploader detached themselves still count toward their pending quota.
ALTER TABLE rich_body_media ADD COLUMN detached_from_owner_id BIGINT;
ALTER TABLE rich_body_media ADD COLUMN detached_by_id BIGINT REFERENCES members(id) ON DELETE SET NULL;
