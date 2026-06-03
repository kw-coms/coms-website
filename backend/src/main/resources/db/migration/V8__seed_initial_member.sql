INSERT INTO eligible_members (student_id, name)
SELECT '2026402040', '최준혁'
WHERE NOT EXISTS (
    SELECT 1 FROM eligible_members WHERE student_id = '2026402040'
);
