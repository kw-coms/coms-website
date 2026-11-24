INSERT INTO role_permissions (role, permission, allowed, updated_at, updated_by)
SELECT role, 'archive.delete', allowed, updated_at, updated_by FROM role_permissions WHERE permission = 'archive.manage';
INSERT INTO role_permissions (role, permission, allowed, updated_at, updated_by)
SELECT role, 'archive.author_change', allowed, updated_at, updated_by FROM role_permissions WHERE permission = 'archive.manage';
INSERT INTO role_permissions (role, permission, allowed, updated_at, updated_by)
SELECT role, 'archive.edit_any', allowed, updated_at, updated_by FROM role_permissions WHERE permission = 'archive.manage';
INSERT INTO role_permissions (role, permission, allowed, updated_at, updated_by)
SELECT role, 'archive.visibility', allowed, updated_at, updated_by FROM role_permissions WHERE permission = 'archive.manage';
DELETE FROM role_permissions WHERE permission = 'archive.manage';

CREATE TABLE member_permission_overrides (
    student_id VARCHAR(255) NOT NULL REFERENCES members(student_id) ON DELETE CASCADE,
    permission_key VARCHAR(60) NOT NULL,
    effect VARCHAR(6) NOT NULL CHECK (effect = 'GRANT' OR effect = 'REVOKE'),
    granted_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, permission_key)
);
