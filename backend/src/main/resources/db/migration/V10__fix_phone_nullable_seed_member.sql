ALTER TABLE eligible_members ALTER COLUMN phone DROP NOT NULL;

INSERT INTO eligible_members (student_id, name)
VALUES ('2026402040', '최준혁')
ON CONFLICT (student_id) DO UPDATE SET name = EXCLUDED.name;
