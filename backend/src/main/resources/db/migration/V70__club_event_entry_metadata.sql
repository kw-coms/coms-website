ALTER TABLE club_event_entries
    ADD COLUMN work_type VARCHAR(40),
    ADD COLUMN summary TEXT,
    ADD COLUMN tags VARCHAR(500),
    ADD COLUMN external_url VARCHAR(500);
