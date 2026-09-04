CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(20) NOT NULL,
    permission VARCHAR(60) NOT NULL,
    allowed BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_by VARCHAR(30),
    PRIMARY KEY (role, permission)
);

INSERT INTO role_permissions (role, permission, allowed)
SELECT source.role, source.permission, source.allowed
FROM (VALUES
    ('ASSOCIATE', 'CLUB_ROOM_VIEW', false),
    ('ASSOCIATE', 'COMMUNITY_ANONYMOUS_BOARD', false),
    ('ASSOCIATE', 'COMMUNITY_MODERATE', false),
    ('ASSOCIATE', 'NOTICE_WRITE', false),
    ('ASSOCIATE', 'ACTIVITY_WRITE', false),
    ('ASSOCIATE', 'PROJECT_WRITE', false),
    ('ASSOCIATE', 'ARCHIVE_MANAGE', false),
    ('ASSOCIATE', 'SITE_SETTINGS_EDIT', false),
    ('ASSOCIATE', 'OPERATIONS_PANEL', false),
    ('USER', 'CLUB_ROOM_VIEW', true),
    ('USER', 'COMMUNITY_ANONYMOUS_BOARD', true),
    ('USER', 'COMMUNITY_MODERATE', false),
    ('USER', 'NOTICE_WRITE', false),
    ('USER', 'ACTIVITY_WRITE', false),
    ('USER', 'PROJECT_WRITE', false),
    ('USER', 'ARCHIVE_MANAGE', false),
    ('USER', 'SITE_SETTINGS_EDIT', false),
    ('USER', 'OPERATIONS_PANEL', false),
    ('OFFICER', 'CLUB_ROOM_VIEW', true),
    ('OFFICER', 'COMMUNITY_ANONYMOUS_BOARD', true),
    ('OFFICER', 'COMMUNITY_MODERATE', false),
    ('OFFICER', 'NOTICE_WRITE', true),
    ('OFFICER', 'ACTIVITY_WRITE', true),
    ('OFFICER', 'PROJECT_WRITE', true),
    ('OFFICER', 'ARCHIVE_MANAGE', false),
    ('OFFICER', 'SITE_SETTINGS_EDIT', true),
    ('OFFICER', 'OPERATIONS_PANEL', true),
    ('VICE_PRESIDENT', 'CLUB_ROOM_VIEW', true),
    ('VICE_PRESIDENT', 'COMMUNITY_ANONYMOUS_BOARD', true),
    ('VICE_PRESIDENT', 'COMMUNITY_MODERATE', true),
    ('VICE_PRESIDENT', 'NOTICE_WRITE', true),
    ('VICE_PRESIDENT', 'ACTIVITY_WRITE', true),
    ('VICE_PRESIDENT', 'PROJECT_WRITE', true),
    ('VICE_PRESIDENT', 'ARCHIVE_MANAGE', true),
    ('VICE_PRESIDENT', 'SITE_SETTINGS_EDIT', true),
    ('VICE_PRESIDENT', 'OPERATIONS_PANEL', true)
) AS source(role, permission, allowed)
WHERE NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing.role = source.role AND existing.permission = source.permission
);
