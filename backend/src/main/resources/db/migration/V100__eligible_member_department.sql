ALTER TABLE eligible_members ADD COLUMN department VARCHAR(100);

-- Prefer the current member profile when the same student id already has a non-blank department.
UPDATE eligible_members e
SET department = LEFT(TRIM(m.department), 100)
FROM members m
WHERE e.department IS NULL
  AND e.student_id = m.student_id
  AND NULLIF(TRIM(m.department), '') IS NOT NULL;

-- For rows still missing a department, use the latest non-blank recruit application.
UPDATE eligible_members e
SET department = (
    SELECT LEFT(TRIM(r.department), 100)
    FROM recruit_applications r
    WHERE r.student_id = e.student_id
      AND NULLIF(TRIM(r.department), '') IS NOT NULL
    ORDER BY r.submitted_at DESC, r.id DESC
    LIMIT 1
)
WHERE e.department IS NULL
  AND EXISTS (
      SELECT 1
      FROM recruit_applications r
      WHERE r.student_id = e.student_id
        AND NULLIF(TRIM(r.department), '') IS NOT NULL
  );

-- Accepted applications are deleted on promotion; use their logs for rows still missing a department.
UPDATE eligible_members e
SET department = (
    SELECT LEFT(TRIM(p.department), 100)
    FROM recruit_promotion_logs p
    WHERE p.student_id = e.student_id
      AND p.decision = 'ACCEPTED'
      AND NULLIF(TRIM(p.department), '') IS NOT NULL
    ORDER BY p.promoted_at DESC, p.id DESC
    LIMIT 1
)
WHERE e.department IS NULL
  AND EXISTS (
      SELECT 1
      FROM recruit_promotion_logs p
      WHERE p.student_id = e.student_id
        AND p.decision = 'ACCEPTED'
        AND NULLIF(TRIM(p.department), '') IS NOT NULL
  );
