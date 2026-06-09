ALTER TABLE community_posts
    ADD COLUMN IF NOT EXISTS anonymous_name VARCHAR(20),
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(80);

ALTER TABLE community_comments
    ADD COLUMN IF NOT EXISTS anonymous_name VARCHAR(20),
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(80);
