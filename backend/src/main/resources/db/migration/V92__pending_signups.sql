CREATE TABLE pending_signups (
    id UUID PRIMARY KEY,
    eligible_member_id BIGINT NOT NULL REFERENCES eligible_members(id),
    student_id VARCHAR(64) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    verification_code_hash VARCHAR(255) NOT NULL,
    code_expires_at TIMESTAMP NOT NULL,
    verification_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    expires_at TIMESTAMP NOT NULL,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100),
    generation VARCHAR(10),
    phone VARCHAR(30),
    aspiration TEXT,
    interests VARCHAR(500),
    signup_type VARCHAR(20) NOT NULL,
    initial_role VARCHAR(20) NOT NULL
);

CREATE UNIQUE INDEX uq_pending_signups_student_id ON pending_signups(student_id);
CREATE UNIQUE INDEX uq_pending_signups_email_ci ON pending_signups(lower(email));
CREATE INDEX idx_pending_signups_expires_at ON pending_signups(expires_at);
