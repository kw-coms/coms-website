-- The resource archive lists files newest-first (findAllByOrderByUploadedAtDesc) on every
-- archive view, but archive_files had no index on uploaded_at. This adds matching coverage
-- for the frequently time-ordered archive listing, mirroring the community_posts/comments
-- created_at indexes (V6, V73).
CREATE INDEX IF NOT EXISTS idx_archive_files_uploaded_at ON archive_files(uploaded_at);
