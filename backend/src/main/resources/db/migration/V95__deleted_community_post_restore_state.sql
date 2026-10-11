-- Deleting a community post removes its votes, bookmarks and poll answers, and the deletion
-- snapshot kept neither those nor the post's anonymous nickname, tag and pin. A restored post
-- therefore came back with a different anonymous identity and none of its reactions.
--
-- restore_state holds that extra state as JSON (CommunityRestoreState) for the restore to read.
-- It is nullable on purpose: snapshots taken before this column have nothing to put back and
-- restore exactly as before.
ALTER TABLE deleted_community_posts
    ADD COLUMN IF NOT EXISTS restore_state TEXT;
