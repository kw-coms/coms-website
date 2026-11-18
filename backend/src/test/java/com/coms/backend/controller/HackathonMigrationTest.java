package com.coms.backend.controller;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Types;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HackathonMigrationTest {
    @Test
    void migrationCreatesIntegerScoresAndDatabaseGuards() throws Exception {
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:hackathon-migration-check;MODE=PostgreSQL")) {
            String sql;
            try (var input = getClass().getResourceAsStream("/db/migration/V112__hackathon_reviews.sql")) {
                assertThat(input).isNotNull();
                sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            }
            try (var statement = db.createStatement()) {
                for (String part : sql.split(";")) if (!part.isBlank()) statement.execute(part);
                try (var settings = statement.executeQuery("SELECT open FROM hackathon_settings WHERE id = 1")) {
                    assertThat(settings.next()).isTrue();
                    assertThat(settings.getBoolean(1)).isTrue();
                }
            }
            for (String column : new String[]{"GENERATION", "THEME_FIT", "CREATIVITY", "TECHNOLOGY", "COMPLETENESS", "PRACTICALITY"}) {
                try (var columns = db.getMetaData().getColumns(null, null, "HACKATHON_REVIEWS", column)) {
                    assertThat(columns.next()).isTrue();
                    assertThat(columns.getInt("DATA_TYPE")).isEqualTo(Types.INTEGER);
                }
            }
            insert(db, 42, "ann", false, 20);
            assertRejected(db, 42, "ann", false, 20); // same person, same team
            assertRejected(db, 42, "bob", false, 21); // score outside 0..20
            assertRejected(db, 61, "bob", false, 20); // unknown generation
            assertRejected(db, 0, "chair", false, 20); // public row may not claim chair identity
            insert(db, 0, "chair", true, 20);
            assertRejected(db, 0, "chair", true, 20); // one chair score per team
        }
    }

    private static void insert(Connection db, int generation, String key, boolean chair, int score) throws SQLException {
        try (var statement = db.prepareStatement("""
                INSERT INTO hackathon_reviews
                    (project_id, generation, name, name_key, chair, theme_fit, creativity,
                     technology, completeness, practicality, feedback)
                VALUES ('still', ?, 'Test', ?, ?, ?, 10, 10, 10, 10, '')
                """)) {
            statement.setInt(1, generation);
            statement.setString(2, key);
            statement.setBoolean(3, chair);
            statement.setInt(4, score);
            statement.executeUpdate();
        }
    }

    private static void assertRejected(Connection db, int generation, String key, boolean chair, int score) {
        assertThatThrownBy(() -> insert(db, generation, key, chair, score))
                .isInstanceOf(SQLException.class)
                .satisfies(ex -> assertThat(((SQLException) ex).getSQLState()).startsWith("23"));
    }
}
