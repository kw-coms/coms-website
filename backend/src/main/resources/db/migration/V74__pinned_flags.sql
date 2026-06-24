-- Pin / 고정 feature for notices and community posts. Admins can pin items so
-- they sort to the top of the list. The notices.pinned column already exists
-- (created in V3) so it is added defensively with IF NOT EXISTS; pinned_at is
-- new on both tables and records when the item was pinned for stable ordering.
-- Portable across H2 (PostgreSQL mode) and real PostgreSQL.
ALTER TABLE notices ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP NULL;

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP NULL;
