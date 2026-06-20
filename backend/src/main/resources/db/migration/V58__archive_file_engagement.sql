-- View count + upvotes for 자료실/Resources (ArchiveFile), mirroring the
-- notice/club-activity engagement model in V51.
ALTER TABLE archive_files ADD COLUMN view_count BIGINT NOT NULL DEFAULT 0;

CREATE TABLE archive_file_votes (
    id BIGSERIAL PRIMARY KEY,
    archive_file_id BIGINT NOT NULL REFERENCES archive_files(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL,
    vote_value INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_archive_file_votes_file_student UNIQUE (archive_file_id, student_id)
);

CREATE INDEX idx_archive_file_votes_file_id ON archive_file_votes(archive_file_id);
