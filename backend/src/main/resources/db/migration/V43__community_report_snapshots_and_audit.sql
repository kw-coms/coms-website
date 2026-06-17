ALTER TABLE community_post_reports
    ADD COLUMN IF NOT EXISTS post_title VARCHAR(120),
    ADD COLUMN IF NOT EXISTS post_author_student_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS post_author_name VARCHAR(100);

UPDATE community_post_reports reports
SET post_title = posts.title,
    post_author_student_id = posts.author_student_id,
    post_author_name = posts.author_name
FROM community_posts posts
WHERE reports.post_id = posts.id
  AND reports.post_title IS NULL;

ALTER TABLE community_post_reports
    ALTER COLUMN post_id DROP NOT NULL;

DO $$
DECLARE
    post_fk_name TEXT;
BEGIN
    SELECT kcu.constraint_name
    INTO post_fk_name
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
     AND tc.table_name = kcu.table_name
    WHERE kcu.table_name = 'community_post_reports'
      AND kcu.column_name = 'post_id'
      AND kcu.table_schema = current_schema()
      AND tc.constraint_type = 'FOREIGN KEY'
    LIMIT 1;

    IF post_fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE community_post_reports DROP CONSTRAINT %I', post_fk_name);
    END IF;
END $$;

ALTER TABLE community_post_reports
    ADD CONSTRAINT fk_community_post_reports_post
    FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE SET NULL;
