CREATE TABLE eligible_members (
  id BIGSERIAL PRIMARY KEY,
  student_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(255) NOT NULL,
  generation VARCHAR(255),
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_eligible_members_student_id UNIQUE (student_id),
  CONSTRAINT uk_eligible_members_name_phone UNIQUE (name, phone)
);

CREATE TABLE community_posts (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  author_student_id VARCHAR(255) NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_posts_created_at ON community_posts (created_at DESC);
