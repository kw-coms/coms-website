CREATE TABLE team_randomizer_rooms (
    id BIGSERIAL PRIMARY KEY,
    room_id VARCHAR(120) NOT NULL,
    room_name VARCHAR(100) NOT NULL,
    owner_student_id VARCHAR(50) NOT NULL,
    owner_name VARCHAR(100),
    version INTEGER NOT NULL DEFAULT 1,
    participants_json TEXT NOT NULL DEFAULT '[]',
    profiles_json TEXT NOT NULL DEFAULT '{}',
    roles_json TEXT NOT NULL DEFAULT '[]',
    role_rules_json TEXT NOT NULL DEFAULT '{}',
    fairness_json TEXT NOT NULL DEFAULT '{}',
    histories_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_team_randomizer_room_owner_room ON team_randomizer_rooms(owner_student_id, room_id);
CREATE INDEX idx_team_randomizer_rooms_owner_updated ON team_randomizer_rooms(owner_student_id, updated_at DESC);
