ALTER TABLE notices ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'GENERAL';

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS image_stored_name VARCHAR(255);
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS image_original_name VARCHAR(255);
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(100);
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_post_votes (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL,
  student_id VARCHAR(255) NOT NULL,
  vote_value INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_community_post_votes_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT uk_community_post_votes_post_student UNIQUE (post_id, student_id),
  CONSTRAINT chk_community_post_votes_value CHECK (vote_value IN (-1, 1))
);

CREATE INDEX IF NOT EXISTS idx_community_post_votes_post_id ON community_post_votes (post_id);
