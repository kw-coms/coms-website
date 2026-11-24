package com.coms.backend.config;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;

class ClubProjectReviewMigrationTest {
    @Test
    void existingAndLegacyInsertedProjectsStayApproved() throws Exception {
        try (var stream = getClass().getClassLoader().getResourceAsStream(
                "db/migration/V128__club_project_review.sql")) {
            assertThat(stream).isNotNull();
            String sql = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            try (var db = DriverManager.getConnection("jdbc:h2:mem:club-project-v125;MODE=PostgreSQL");
                 var statement = db.createStatement()) {
                statement.execute("CREATE TABLE club_projects (id BIGINT PRIMARY KEY)");
                statement.execute("INSERT INTO club_projects(id) VALUES (1)");
                for (String command : sql.split(";")) {
                    if (!command.isBlank()) statement.execute(command.trim());
                }
                statement.execute("INSERT INTO club_projects(id) VALUES (2)");
                try (var rows = statement.executeQuery("SELECT id, review_status, version FROM club_projects ORDER BY id")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getLong(1)).isEqualTo(1);
                    assertThat(rows.getString(2)).isEqualTo("APPROVED");
                    assertThat(rows.getLong(3)).isZero();
                    assertThat(rows.wasNull()).isFalse();
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getLong(1)).isEqualTo(2);
                    assertThat(rows.getString(2)).isEqualTo("APPROVED");
                    assertThat(rows.getLong(3)).isZero();
                    assertThat(rows.wasNull()).isFalse();
                    assertThat(rows.next()).isFalse();
                }
            }
        }
    }
}
