package com.coms.backend.controller;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TeamProjectMigrationTest {
    @Test
    void migrationEnforcesOneTeamPerProgramAndCascadesDeletes() throws Exception {
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:team-project-migration-check;MODE=PostgreSQL")) {
            String sql;
            try (var input = getClass().getResourceAsStream("/db/migration/V116__team_projects.sql")) {
                assertThat(input).isNotNull();
                sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            }
            try (var s = db.createStatement()) {
                // 이 마이그레이션이 참조하는 members.student_id 만 흉내 낸다.
                s.execute("CREATE TABLE members (id BIGINT PRIMARY KEY, student_id VARCHAR(255) NOT NULL UNIQUE)");
                s.execute("INSERT INTO members VALUES (1, 'a'), (2, 'b')");
                for (String part : sql.split(";")) if (!part.isBlank()) s.execute(part);
                s.execute("INSERT INTO team_projects (id, title) VALUES (1, '팀프'), (2, '다음')");
                s.execute("INSERT INTO team_project_teams (id, program_id, name) VALUES (10, 1, 'A'), (11, 1, 'B'), (12, 2, 'A')");
                assertThatThrownBy(() -> s.execute("INSERT INTO team_project_teams (program_id, name) VALUES (1, 'A')"))
                        .hasMessageContaining("UQ_TEAM_PROJECT_TEAM_NAME");
                s.execute("INSERT INTO team_project_members (program_id, team_id, student_id) VALUES (1, 10, 'a')");
                assertThatThrownBy(() -> s.execute("INSERT INTO team_project_members (program_id, team_id, student_id) VALUES (1, 11, 'a')"))
                        .hasMessageContaining("UQ_TEAM_PROJECT_MEMBER_ONCE");
                s.execute("INSERT INTO team_project_members (program_id, team_id, student_id) VALUES (2, 12, 'a')");
                assertThatThrownBy(() -> s.execute("INSERT INTO team_project_members (program_id, team_id, student_id) VALUES (2, 12, 'nobody')"))
                        .isInstanceOf(java.sql.SQLException.class);
                s.execute("INSERT INTO team_project_milestones (id, program_id, title, submittable) VALUES (20, 1, '계획서', TRUE)");
                s.execute("INSERT INTO team_project_submissions (id, program_id, team_id, milestone_id, submitted_by, submitted_by_name, updated_by, updated_by_name, submitted_at, updated_at) "
                        + "VALUES (30, 1, 10, 20, 'a', 'A', 'a', 'A', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
                assertThatThrownBy(() -> s.execute("INSERT INTO team_project_submissions (program_id, team_id, milestone_id, submitted_by, submitted_by_name, updated_by, updated_by_name, submitted_at, updated_at) "
                        + "VALUES (1, 10, 20, 'a', 'A', 'a', 'A', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")).isInstanceOf(java.sql.SQLException.class);
                s.execute("INSERT INTO team_project_submission_files (submission_id, original_name, mime_type, file_size, stored_name, uploaded_by, uploaded_at) "
                        + "VALUES (30, 'a.bin', 'application/octet-stream', 1, 'x.bin', 'a', CURRENT_TIMESTAMP)");
                // 회원을 지우면 팀원 행이, 프로그램을 지우면 하위 전부가 함께 지워진다.
                s.execute("DELETE FROM members WHERE student_id = 'a'");
                assertThat(count(s, "team_project_members")).isZero();
                s.execute("DELETE FROM team_projects WHERE id = 1");
                for (String table : new String[]{"team_project_teams", "team_project_milestones", "team_project_submissions", "team_project_submission_files"}) {
                    assertThat(count(s, table)).as(table).isEqualTo(table.equals("team_project_teams") ? 1 : 0);
                }
            }
        }
    }

    private static int count(java.sql.Statement s, String table) throws Exception {
        try (var rows = s.executeQuery("SELECT COUNT(*) FROM " + table)) {
            rows.next();
            return rows.getInt(1);
        }
    }
}
