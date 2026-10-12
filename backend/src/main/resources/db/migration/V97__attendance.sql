-- Attendance ("출석 체크"): whoever runs a seminar opens a session, a short code goes up on the
-- screen, and members check in with it from their own devices while the session is open.
-- Two new tables; nothing that exists is altered.

CREATE TABLE attendance_sessions (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    code VARCHAR(8) NOT NULL,
    opened_by_student_id VARCHAR(50) NOT NULL,
    opened_by_name VARCHAR(100) NOT NULL,
    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Check-in stops here by itself; closed_at is set when it is stopped by hand before that.
    closes_at TIMESTAMP NOT NULL,
    closed_at TIMESTAMP
);

CREATE INDEX idx_attendance_sessions_opened ON attendance_sessions(opened_at DESC);

CREATE TABLE attendance_records (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id VARCHAR(50) NOT NULL,
    member_name VARCHAR(100) NOT NULL,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_attendance_record_member UNIQUE (session_id, student_id)
);

CREATE INDEX idx_attendance_records_student ON attendance_records(student_id);
