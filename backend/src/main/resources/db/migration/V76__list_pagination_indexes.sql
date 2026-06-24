-- Supporting indexes for the (now optionally paginated) list endpoints flagged in the security audit.
--
-- Only genuinely missing indexes are added here; the other audited lists already have covering
-- indexes from earlier migrations and are therefore intentionally omitted:
--   * club_activities  -> idx_club_activities_event_date (event_date DESC, created_at DESC)  (V49)
--   * club_events      -> idx_club_events_created_at (created_at DESC)                        (V68)
--   * archive_files    -> idx_archive_files_uploaded_at (uploaded_at)                         (V75)
--   * recruit_applications -> idx_recruit_applications_submitted_at (submitted_at DESC)       (V39)
--   * members (admin list) sorts on no column (findAll, no ORDER BY) so needs no index here.
--
-- The community and notice lists sort by (pinned DESC, pinned_at DESC, created_at DESC). The pinned
-- columns were introduced in V74 with NO covering index, so the existing single-column created_at
-- indexes (idx_community_posts_created_at, the notices created_at order) cannot satisfy the full sort.
-- The mobile home preview now issues these ordered queries with a LIMIT, making a matching composite
-- index worthwhile. Append-only; portable across H2 (PostgreSQL mode) and real PostgreSQL.

CREATE INDEX IF NOT EXISTS idx_community_posts_pinned_order
    ON community_posts (pinned DESC, pinned_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notices_pinned_order
    ON notices (pinned DESC, pinned_at DESC, created_at DESC);
