ALTER TABLE archive_files ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'MEMBERS';

CREATE TABLE archive_file_selected_members (
    archive_file_id BIGINT NOT NULL REFERENCES archive_files(id) ON DELETE CASCADE,
    student_id VARCHAR(255) NOT NULL REFERENCES members(student_id) ON DELETE CASCADE,
    PRIMARY KEY (archive_file_id, student_id)
);

CREATE INDEX idx_archive_file_selected_members_student ON archive_file_selected_members(student_id);
