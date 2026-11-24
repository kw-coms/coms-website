ALTER TABLE hackathon_events ADD COLUMN allow_guest_reviews BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hackathon_reviews ADD COLUMN ip_key VARCHAR(45) NULL;
ALTER TABLE hackathon_reviews ADD COLUMN reviewer_student_id VARCHAR(20) NULL;
CREATE UNIQUE INDEX uq_hackathon_review_ip ON hackathon_reviews (event_id, project_id, ip_key);
CREATE UNIQUE INDEX uq_hackathon_review_member ON hackathon_reviews (event_id, project_id, reviewer_student_id);
