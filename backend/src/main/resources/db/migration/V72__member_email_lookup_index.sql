CREATE INDEX IF NOT EXISTS idx_members_lower_email ON members (lower(email));
