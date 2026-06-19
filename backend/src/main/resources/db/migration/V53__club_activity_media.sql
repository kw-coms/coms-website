-- Multiple photos + file attachments per club activity, mirroring the community
-- post media tables. The existing single-image columns on club_activities are
-- kept for backward-compat; legacy activities are migrated into the new image
-- table below so the UI can render them uniformly.
CREATE TABLE club_activity_images (
    id BIGSERIAL PRIMARY KEY,
    club_activity_id BIGINT NOT NULL REFERENCES club_activities(id) ON DELETE CASCADE,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(100),
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_club_activity_images_activity_id ON club_activity_images(club_activity_id);

CREATE TABLE club_activity_files (
    id BIGSERIAL PRIMARY KEY,
    club_activity_id BIGINT NOT NULL REFERENCES club_activities(id) ON DELETE CASCADE,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_club_activity_files_activity_id ON club_activity_files(club_activity_id);

-- Migrate existing single-image activities into the new image table so they
-- display through the same multi-image path. The legacy columns remain populated
-- for safety and are no longer the source of truth for the response payload.
INSERT INTO club_activity_images (club_activity_id, stored_name, original_name, mime_type, position)
SELECT id, image_stored_name, image_original_name, image_mime_type, 0
FROM club_activities
WHERE image_stored_name IS NOT NULL;
