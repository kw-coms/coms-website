-- Community feeds and the deleted-post archive read comments newest-first across
-- the whole table (audit/moderation views), but community_comments only had
-- post_id / parent composite indexes (V23, V25, V33) — no standalone created_at
-- index. The community_posts created_at ordering is already covered by
-- idx_community_posts_created_at (V6); this adds the matching coverage for the
-- frequently time-ordered comments table.
CREATE INDEX IF NOT EXISTS idx_community_comments_created_at ON community_comments (created_at DESC);
