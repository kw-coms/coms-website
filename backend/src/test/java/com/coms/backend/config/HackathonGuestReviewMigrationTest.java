package com.coms.backend.config;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HackathonGuestReviewMigrationTest {
    @Test
    void existingVotesSurviveAndNewGuestAndMemberIdentitiesAreUniquePerProject() throws Exception {
        try (var stream = getClass().getClassLoader().getResourceAsStream(
                "db/migration/V127__hackathon_guest_review_guard.sql")) {
            assertThat(stream).isNotNull();
            String sql = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            try (var db = DriverManager.getConnection("jdbc:h2:mem:hackathon-v124;MODE=PostgreSQL");
                 var statement = db.createStatement()) {
                // V113 already added event_id and assigned historical votes to event 1.
                statement.execute("CREATE TABLE hackathon_events (id BIGINT PRIMARY KEY)");
                statement.execute("CREATE TABLE hackathon_reviews (id BIGINT PRIMARY KEY, event_id BIGINT NOT NULL, "
                        + "project_id VARCHAR(40) NOT NULL, generation INTEGER NOT NULL, name_key VARCHAR(80) NOT NULL)");
                statement.execute("INSERT INTO hackathon_events(id) VALUES (1)");
                statement.execute("INSERT INTO hackathon_reviews(id, event_id, project_id, generation, name_key) VALUES "
                        + "(1, 1, 'wargether', 1, 'first'), (2, 1, 'wargether', 2, 'second')");
                for (String command : sql.split(";")) {
                    if (!command.isBlank()) statement.execute(command.trim());
                }
                statement.execute("INSERT INTO hackathon_events(id) VALUES (2)");
                try (var rows = statement.executeQuery("SELECT id, allow_guest_reviews FROM hackathon_events ORDER BY id")) {
                    for (long id = 1; id <= 2; id++) {
                        assertThat(rows.next()).isTrue();
                        assertThat(rows.getLong(1)).isEqualTo(id);
                        assertThat(rows.getBoolean(2)).isFalse();
                    }
                    assertThat(rows.next()).isFalse();
                }
                try (var rows = statement.executeQuery("SELECT COUNT(*) FROM hackathon_reviews "
                        + "WHERE event_id = 1 AND project_id = 'wargether' "
                        + "AND ip_key IS NULL AND reviewer_student_id IS NULL")) {
                    rows.next();
                    assertThat(rows.getLong(1)).isEqualTo(2);
                }

                statement.execute("INSERT INTO hackathon_reviews(id, event_id, project_id, generation, name_key, ip_key) "
                        + "VALUES (3, 1, 'wargether', 3, 'third', '203.0.113.1')");
                assertThrows(SQLException.class, () -> statement.execute(
                        "INSERT INTO hackathon_reviews(id, event_id, project_id, generation, name_key, ip_key) "
                                + "VALUES (4, 1, 'wargether', 4, 'fourth', '203.0.113.1')"));
                statement.execute("INSERT INTO hackathon_reviews(id, event_id, project_id, generation, name_key, ip_key) "
                        + "VALUES (5, 1, 'still', 3, 'third', '203.0.113.1')");

                statement.execute("INSERT INTO hackathon_reviews(id, event_id, project_id, generation, name_key, reviewer_student_id) "
                        + "VALUES (6, 1, 'wargether', 5, 'fifth', '2026000001')");
                assertThrows(SQLException.class, () -> statement.execute(
                        "INSERT INTO hackathon_reviews(id, event_id, project_id, generation, name_key, reviewer_student_id) "
                                + "VALUES (7, 1, 'wargether', 6, 'sixth', '2026000001')"));
                statement.execute("INSERT INTO hackathon_reviews(id, event_id, project_id, generation, name_key, reviewer_student_id) "
                        + "VALUES (8, 2, 'wargether', 1, 'first', '2026000001')");
            }
        }
    }
}
