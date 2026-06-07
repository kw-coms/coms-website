ALTER TABLE members ADD COLUMN password_reset_code_hash VARCHAR(255);
ALTER TABLE members ADD COLUMN password_reset_expires_at TIMESTAMP;
