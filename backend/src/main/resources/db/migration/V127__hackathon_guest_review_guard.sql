ALTER TABLE hackathon_events ADD COLUMN allow_guest_reviews BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hackathon_reviews ADD COLUMN ip_key VARCHAR(45) NULL;
ALTER TABLE hackathon_reviews ADD COLUMN reviewer_student_id VARCHAR(20) NULL;
ALTER TABLE hackathon_reviews DROP CONSTRAINT uq_hackathon_review_identity;
CREATE UNIQUE INDEX uq_hackathon_review_guest_identity ON hackathon_reviews (event_id, project_id, generation, name_key) WHERE reviewer_student_id IS NULL;
CREATE UNIQUE INDEX uq_hackathon_review_ip ON hackathon_reviews (event_id, project_id, ip_key);
CREATE UNIQUE INDEX uq_hackathon_review_member ON hackathon_reviews (event_id, project_id, reviewer_student_id) WHERE reviewer_student_id IS NOT NULL;
