CREATE TABLE study_sessions (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    round_no INTEGER NOT NULL,
    session_date DATE NOT NULL,
    topic VARCHAR(160) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_study_session_round UNIQUE (group_id, round_no)
);
CREATE INDEX idx_study_sessions_group ON study_sessions(group_id, round_no);
ALTER TABLE attendance_sessions ADD COLUMN study_session_id BIGINT REFERENCES study_sessions(id) ON DELETE CASCADE;
ALTER TABLE attendance_sessions ADD COLUMN first_opened_at TIMESTAMP;
ALTER TABLE attendance_sessions ADD CONSTRAINT uk_attendance_study_session UNIQUE (study_session_id);
ALTER TABLE attendance_records ALTER COLUMN checked_at DROP NOT NULL;
ALTER TABLE attendance_records ADD COLUMN status VARCHAR(12) NOT NULL DEFAULT 'PRESENT';
ALTER TABLE attendance_records ADD COLUMN source VARCHAR(12) NOT NULL DEFAULT 'CODE';
CREATE TABLE attendance_code_lock (id SMALLINT PRIMARY KEY);
INSERT INTO attendance_code_lock (id) VALUES (1);
