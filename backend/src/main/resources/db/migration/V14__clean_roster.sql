DELETE FROM eligible_members WHERE student_id != '2026402040';
INSERT INTO eligible_members (student_id, name, generation)
VALUES ('2026402040', '최준혁', '60')
ON CONFLICT (student_id) DO UPDATE SET name = '최준혁', generation = '60';
