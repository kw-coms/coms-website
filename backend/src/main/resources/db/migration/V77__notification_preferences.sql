CREATE TABLE notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    member_student_id VARCHAR(50) NOT NULL,
    comment_on_post BOOLEAN NOT NULL DEFAULT TRUE,
    reply_on_comment BOOLEAN NOT NULL DEFAULT TRUE,
    notice_created BOOLEAN NOT NULL DEFAULT TRUE,
    external_invite BOOLEAN NOT NULL DEFAULT TRUE,
    community_post_restored BOOLEAN NOT NULL DEFAULT TRUE,
    community_post_deleted BOOLEAN NOT NULL DEFAULT TRUE,
    recruit_application BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_notification_preferences_member ON notification_preferences(member_student_id);
