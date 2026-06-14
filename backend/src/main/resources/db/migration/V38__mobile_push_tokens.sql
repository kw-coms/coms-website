CREATE TABLE IF NOT EXISTS mobile_push_tokens (
    id BIGSERIAL PRIMARY KEY,
    member_student_id VARCHAR(32) NOT NULL,
    token VARCHAR(1024) NOT NULL,
    platform VARCHAR(64),
    device_id VARCHAR(128),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_mobile_push_tokens_token ON mobile_push_tokens(token);
CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_member ON mobile_push_tokens(member_student_id);
CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_updated ON mobile_push_tokens(updated_at);
