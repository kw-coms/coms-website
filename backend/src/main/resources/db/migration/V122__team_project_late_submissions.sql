ALTER TABLE team_projects
    ADD COLUMN allow_late_submissions BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE team_project_submissions
    ADD COLUMN submitted_after_close BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE team_project_submissions
    ADD COLUMN timing VARCHAR(12) NOT NULL DEFAULT 'AUTOMATIC'
        CHECK (timing IN ('AUTOMATIC', 'ON_TIME', 'LATE'));
