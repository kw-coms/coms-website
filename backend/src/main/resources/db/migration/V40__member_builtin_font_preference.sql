ALTER TABLE members
    ADD COLUMN selected_builtin_font_key VARCHAR(50) NULL;

ALTER TABLE members
    ADD CONSTRAINT chk_members_single_font_preference
        CHECK (selected_font_id IS NULL OR selected_builtin_font_key IS NULL);
