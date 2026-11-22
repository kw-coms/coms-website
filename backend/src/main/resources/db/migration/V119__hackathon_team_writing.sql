ALTER TABLE hackathon_projects ADD COLUMN team_name VARCHAR(120);
ALTER TABLE hackathon_projects ADD COLUMN published BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE hackathon_projects ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE hackathon_project_members (
    project_id VARCHAR(40) NOT NULL REFERENCES hackathon_projects(id) ON DELETE CASCADE,
    member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, member_id)
);

CREATE INDEX idx_hackathon_project_members_member ON hackathon_project_members(member_id);
