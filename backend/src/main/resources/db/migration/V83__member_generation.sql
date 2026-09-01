-- 기수(generation) becomes a first-class member attribute instead of being derived
-- from the student id (편입생 등은 학번 연도와 기수가 다르다).
ALTER TABLE members ADD COLUMN generation VARCHAR(10);

-- Backfill: prefer the roster's generation (admins may have corrected it there),
-- fall back to the studentId-derived value for 10-digit ids and G-ids.
UPDATE members m
SET generation = e.generation
FROM eligible_members e
WHERE e.student_id = m.student_id
  AND e.generation IS NOT NULL;

UPDATE members
SET generation = CAST(CAST(substring(student_id, 1, 4) AS integer) - 1966 AS varchar)
WHERE generation IS NULL
  AND student_id ~ '^[0-9]{10}$';

UPDATE members
SET generation = CAST(CAST(substring(student_id, 2, 4) AS integer) - 1966 AS varchar)
WHERE generation IS NULL
  AND student_id ~ '^G[0-9]{4}-[0-9]+$';
