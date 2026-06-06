ALTER TABLE eligible_members ADD COLUMN verification_key VARCHAR(255);
ALTER TABLE eligible_members ADD COLUMN admission_year INTEGER;

CREATE UNIQUE INDEX uk_eligible_members_verification_key
    ON eligible_members (verification_key);

UPDATE eligible_members
SET admission_year = CASE
    WHEN student_id ~ '^[0-9]{10}$' THEN CAST(SUBSTRING(student_id FROM 1 FOR 4) AS INTEGER)
    WHEN NULLIF(REGEXP_REPLACE(generation, '[^0-9]', '', 'g'), '') IS NOT NULL
        THEN CAST(REGEXP_REPLACE(generation, '[^0-9]', '', 'g') AS INTEGER) + 1966
    ELSE NULL
END;

UPDATE eligible_members e
SET verification_key = LOWER(TRIM(e.name)) || '|' || CAST(e.admission_year AS VARCHAR)
WHERE e.student_id IS NULL
  AND e.admission_year IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM eligible_members duplicate
    WHERE duplicate.student_id IS NULL
      AND duplicate.admission_year = e.admission_year
      AND duplicate.name = e.name
      AND duplicate.id <> e.id
  );
