ALTER TABLE study_groups ALTER COLUMN leader_student_id DROP NOT NULL;

UPDATE study_groups
SET leader_student_id = NULL
WHERE leader_student_id = 'removed' AND status = 'ENDED'
  AND NOT EXISTS (
      SELECT 1 FROM study_group_members m
      WHERE m.group_id = study_groups.id AND m.student_id = 'removed'
        AND m.role = 'LEADER' AND m.status = 'APPROVED'
  );
