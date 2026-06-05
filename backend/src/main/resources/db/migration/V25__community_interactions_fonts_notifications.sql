ALTER TABLE community_comments
    ADD COLUMN parent_comment_id BIGINT NULL,
    ADD COLUMN depth INT NOT NULL DEFAULT 0;

ALTER TABLE community_comments
    ADD CONSTRAINT fk_community_comments_parent
        FOREIGN KEY (parent_comment_id) REFERENCES community_comments(id) ON DELETE CASCADE;

CREATE INDEX idx_community_comments_parent_id ON community_comments(parent_comment_id);
CREATE INDEX idx_community_comments_post_parent_created ON community_comments(post_id, parent_comment_id, created_at);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_student_id VARCHAR(50) NOT NULL,
    actor_student_id VARCHAR(50),
    type VARCHAR(40) NOT NULL,
    post_id BIGINT,
    comment_id BIGINT,
    notice_id BIGINT,
    message VARCHAR(300) NOT NULL,
    read_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient_created ON notifications(recipient_student_id, created_at DESC);
CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_student_id, read_at);

CREATE TABLE site_fonts (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_site_fonts_active_name ON site_fonts(active, name);

ALTER TABLE members
    ADD COLUMN selected_font_id BIGINT NULL;

ALTER TABLE members
    ADD CONSTRAINT fk_members_selected_font
        FOREIGN KEY (selected_font_id) REFERENCES site_fonts(id) ON DELETE SET NULL;
