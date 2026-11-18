package com.coms.backend.controller;

import db.migration.V113__hackathon_events;
import org.flywaydb.core.api.configuration.Configuration;
import org.flywaydb.core.api.migration.Context;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HackathonEventsMigrationTest {
    @Test
    void preservesExistingReviewsAndAddsEventOwnership() throws Exception {
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:hackathon-events-migration;MODE=PostgreSQL")) {
            legacySchema(db);
            try (Statement sql = db.createStatement()) {
                sql.execute("CREATE SCHEMA DECOY");
                sql.execute("CREATE TABLE DECOY.hackathon_reviews(project_id VARCHAR(40) CHECK (project_id IN ('unrelated')))");
            }
            try (Statement sql = db.createStatement()) {
                sql.execute("INSERT INTO hackathon_reviews (id,project_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback,created_at) VALUES (42,'still',19,'기존 평가자','기존평가자',FALSE,18,17,16,15,14,'기존 피드백',TIMESTAMP '2026-11-18 09:00:00')");
            }
            String before = snapshot(db);
            new V113__hackathon_events().migrate(context(db));
            assertThat(snapshot(db)).isEqualTo(before);
            try (Statement sql = db.createStatement()) {
                try (var rows = sql.executeQuery("SELECT event_id FROM hackathon_reviews WHERE id=42")) {
                    assertThat(rows.next()).isTrue(); assertThat(rows.getLong(1)).isEqualTo(1);
                }
                try (var rows = sql.executeQuery("SELECT COUNT(*) FROM hackathon_materials WHERE event_id=1")) {
                    rows.next(); assertThat(rows.getInt(1)).isEqualTo(13);
                }
                try (var rows = sql.executeQuery("SELECT open,published FROM hackathon_events WHERE id=1")) {
                    rows.next(); assertThat(rows.getBoolean(1)).isTrue(); assertThat(rows.getBoolean(2)).isTrue();
                }
                sql.execute("INSERT INTO hackathon_events(title,event_year,semester,published,open) VALUES ('다음 해커톤',2027,1,TRUE,TRUE)");
                sql.execute("INSERT INTO hackathon_projects(id,event_id,title,author,description,position) VALUES ('new-team',2,'새 팀','작성자','새 작품',0)");
                sql.execute("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('new-team',2,19,'기존 평가자','기존평가자',FALSE,18,17,16,15,14,'')");
                assertThatThrownBy(() -> sql.execute("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('new-team',2,19,'중복','기존평가자',FALSE,18,17,16,15,14,'')")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.execute("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('still',2,19,'잘못된 팀','오류',FALSE,18,17,16,15,14,'')")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.execute("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('new-team',2,19,'점수초과','오류2',FALSE,21,17,16,15,14,'')")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.execute("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('new-team',2,61,'기수초과','오류3',FALSE,18,17,16,15,14,'')")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.execute("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('new-team',2,0,'회장사칭','오류4',FALSE,18,17,16,15,14,'')")).isInstanceOf(SQLException.class);
            }
        }
    }

    @Test
    void rejectsUnexpectedConstraintBeforeDdl() throws Exception {
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:hackathon-events-unexpected;MODE=PostgreSQL")) {
            legacySchema(db);
            try (var checks = db.createStatement().executeQuery("""
                    SELECT tc.constraint_name, cc.check_clause
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.check_constraints cc
                      ON tc.constraint_catalog=cc.constraint_catalog
                     AND tc.constraint_schema=cc.constraint_schema
                     AND tc.constraint_name=cc.constraint_name
                    WHERE tc.table_name='HACKATHON_REVIEWS' AND tc.constraint_type='CHECK'
                    """)) {
                while (checks.next()) {
                    String name = checks.getString(1);
                    if (checks.getString(2).toLowerCase().contains("project_id")) try (Statement sql = db.createStatement()) { sql.execute("ALTER TABLE hackathon_reviews DROP CONSTRAINT \"" + name + "\""); break; }
                }
            }
            assertThatThrownBy(() -> new V113__hackathon_events().migrate(context(db))).isInstanceOf(SQLException.class);
            try (var tables = db.getMetaData().getTables(null, null, "HACKATHON_EVENTS", null)) { assertThat(tables.next()).isFalse(); }
        }
    }

    @Test
    void extraAllowedProjectIsNotMistakenForTheKnownConstraint() throws Exception {
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:hackathon-events-extra-check;MODE=PostgreSQL")) {
            legacySchema(db);
            String checkName = null;
            try (var checks = db.createStatement().executeQuery("""
                    SELECT tc.constraint_name, cc.check_clause FROM information_schema.table_constraints tc
                    JOIN information_schema.check_constraints cc ON tc.constraint_catalog=cc.constraint_catalog
                        AND tc.constraint_schema=cc.constraint_schema AND tc.constraint_name=cc.constraint_name
                    WHERE tc.table_name='HACKATHON_REVIEWS' AND tc.constraint_type='CHECK'
                    """)) {
                while (checks.next()) if (checks.getString(2).toLowerCase().contains("project_id")) checkName = checks.getString(1);
            }
            assertThat(checkName).isNotNull();
            try (Statement sql = db.createStatement()) {
                sql.execute("ALTER TABLE hackathon_reviews DROP CONSTRAINT \"" + checkName + "\"");
                sql.execute("ALTER TABLE hackathon_reviews ADD CONSTRAINT unexpected_allowlist CHECK (project_id IN ('wargether','underground-route','still','unknown'))");
            }
            assertThatThrownBy(() -> new V113__hackathon_events().migrate(context(db))).isInstanceOf(SQLException.class);
            try (var tables = db.getMetaData().getTables(null, null, "HACKATHON_EVENTS", null)) { assertThat(tables.next()).isFalse(); }
        }
    }

    @Test
    void unusualCatalogIdentifierFailsBeforeDdl() throws Exception {
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:hackathon-events-bad-identifier;MODE=PostgreSQL")) {
            legacySchema(db);
            try (Statement sql = db.createStatement()) {
                sql.execute("ALTER TABLE hackathon_reviews DROP CONSTRAINT \"" + projectCheckName(db) + "\"");
                sql.execute("ALTER TABLE hackathon_reviews ADD CONSTRAINT \"unsafe;identifier\" CHECK (project_id IN ('wargether','underground-route','still'))");
            }
            assertThatThrownBy(() -> new V113__hackathon_events().migrate(context(db))).isInstanceOf(SQLException.class);
            assertNoNewEventTable(db);
        }
    }

    @Test
    void alteredBooleanLogicAndDuplicateChecksFailBeforeDdl() throws Exception {
        String[] additions = {
                "CHECK (project_id IN ('wargether','underground-route','still') OR chair)",
                "CHECK (project_id IN ('wargether','underground-route','still') AND generation >= 0)",
                "CHECK (COALESCE(project_id,'still') IN ('wargether','underground-route','still'))",
                "CHECK (project_id IN ('WARGETHER','underground-route','still'))",
                "CHECK (project_id IN ('war gether','underground-route','still'))"
        };
        for (int i = 0; i < additions.length; i++) {
            try (Connection db = DriverManager.getConnection("jdbc:h2:mem:hackathon-events-bad-logic-" + i + ";MODE=PostgreSQL")) {
                legacySchema(db);
                String oldCheck = projectCheckName(db);
                try (Statement sql = db.createStatement()) {
                    sql.execute("ALTER TABLE hackathon_reviews DROP CONSTRAINT \"" + oldCheck + "\"");
                    sql.execute("ALTER TABLE hackathon_reviews ADD CONSTRAINT unexpected_logic " + additions[i]);
                }
                assertThatThrownBy(() -> new V113__hackathon_events().migrate(context(db))).isInstanceOf(SQLException.class);
                assertNoNewEventTable(db);
            }
        }
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:hackathon-events-duplicate-check;MODE=PostgreSQL")) {
            legacySchema(db);
            try (Statement sql = db.createStatement()) {
                sql.execute("ALTER TABLE hackathon_reviews ADD CONSTRAINT duplicated_allowlist CHECK (project_id IN ('wargether','underground-route','still'))");
            }
            assertThatThrownBy(() -> new V113__hackathon_events().migrate(context(db))).isInstanceOf(SQLException.class);
            assertNoNewEventTable(db);
        }
    }

    @Test
    void missingLegacySettingsFailClosedWhileKeepingHistoricalEvent() throws Exception {
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:hackathon-events-no-settings;MODE=PostgreSQL")) {
            legacySchema(db);
            try (Statement sql = db.createStatement()) { sql.execute("DELETE FROM hackathon_settings"); }
            new V113__hackathon_events().migrate(context(db));
            try (Statement sql = db.createStatement(); var rows = sql.executeQuery("SELECT published,open FROM hackathon_events WHERE id=1")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getBoolean(1)).isTrue();
                assertThat(rows.getBoolean(2)).isFalse();
            }
        }
    }

    private static Context context(Connection db) {
        return new Context() {
            public Configuration getConfiguration() { return null; }
            public Connection getConnection() { return db; }
        };
    }

    private static String projectCheckName(Connection db) throws SQLException {
        try (Statement statement = db.createStatement(); var checks = statement.executeQuery("""
                SELECT tc.constraint_name, cc.check_clause FROM information_schema.table_constraints tc
                JOIN information_schema.check_constraints cc ON tc.constraint_catalog=cc.constraint_catalog
                    AND tc.constraint_schema=cc.constraint_schema AND tc.constraint_name=cc.constraint_name
                WHERE tc.table_schema='PUBLIC' AND tc.table_name='HACKATHON_REVIEWS' AND tc.constraint_type='CHECK'
                """)) {
            while (checks.next()) if (checks.getString(2).toLowerCase().contains("project_id")) return checks.getString(1);
        }
        throw new SQLException("Legacy project check missing from fixture");
    }

    private static void assertNoNewEventTable(Connection db) throws SQLException {
        try (var tables = db.getMetaData().getTables(null, "PUBLIC", "HACKATHON_EVENTS", null)) {
            assertThat(tables.next()).isFalse();
        }
    }

    private static void legacySchema(Connection db) throws Exception {
        String sql;
        try (var input = HackathonEventsMigrationTest.class.getResourceAsStream("/db/migration/V112__hackathon_reviews.sql")) {
            assertThat(input).isNotNull(); sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
        try (Statement statement = db.createStatement()) {
            for (String part : sql.split(";")) if (!part.isBlank()) statement.execute(part);
        }
    }

    private static String snapshot(Connection db) throws SQLException {
        try (Statement sql = db.createStatement(); var rows = sql.executeQuery("SELECT id,project_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback,created_at FROM hackathon_reviews ORDER BY id")) {
            StringBuilder snapshot = new StringBuilder();
            while (rows.next()) for (int field = 1; field <= 13; field++) snapshot.append(rows.getString(field)).append('|');
            return snapshot.toString();
        }
    }
}
