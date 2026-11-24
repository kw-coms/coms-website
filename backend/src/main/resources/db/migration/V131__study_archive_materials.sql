ALTER TABLE archive_files ADD COLUMN study_group_id BIGINT REFERENCES study_groups(id) ON DELETE CASCADE;
ALTER TABLE archive_files ADD COLUMN study_session_id BIGINT REFERENCES study_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_archive_files_study_group ON archive_files(study_group_id, uploaded_at DESC);
CREATE INDEX idx_archive_files_study_session ON archive_files(study_session_id);
