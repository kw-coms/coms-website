ALTER TABLE eligible_members ALTER COLUMN phone DROP NOT NULL;

INSERT INTO eligible_members (student_id, name, created_at, updated_at)
VALUES ('2026402040', '최준혁', NOW(), NOW())
ON CONFLICT (student_id) DO UPDATE SET name = EXCLUDED.name;
