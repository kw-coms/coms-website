CREATE TABLE login_failures (
    id BIGSERIAL PRIMARY KEY,
    student_id VARCHAR(50),
    ip VARCHAR(45),
    attempted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_failures_student_id_attempted_at ON login_failures(student_id, attempted_at);
CREATE INDEX idx_login_failures_ip_attempted_at ON login_failures(ip, attempted_at);
