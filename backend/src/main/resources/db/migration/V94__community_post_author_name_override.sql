-- 회장 can replace only the displayed author name of a community post. The custom name was
-- stored in author_name, but every response derives the name from the linked member, so the
-- change never showed. This flag marks the rows whose stored name must be shown as written.
--
-- Existing rows keep FALSE: nothing changes for them. (An override made before this column
-- existed cannot be told apart from a member who was later renamed, so it is not backfilled.)
ALTER TABLE community_posts
    ADD COLUMN IF NOT EXISTS author_name_overridden BOOLEAN NOT NULL DEFAULT FALSE;
