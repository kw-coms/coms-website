package com.coms.backend.service;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the real V88 / V106 scripts through Flyway on H2 (PostgreSQL mode): V106 anonymizes exactly
 * the row with id 1 dated 2026-09-04 (an operator request) and nothing else, and is a no-op on rerun.
 */
class AnonymizeSponsorMigrationTest {
    private static final String V88 = "V88__sponsors.sql";
    private static final String V106 = "V106__anonymize_sponsor.sql";
    private static final String V107 = "V107__sponsor_name_for_members.sql";

    @TempDir
    Path migrationDirectory;

    @Test
    void anonymizesOnlyTheNamedRowWithTheMatchingDateAndRerunsAsANoOp() throws Exception {
        String url = "jdbc:h2:mem:anonymize_sponsor;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        Files.writeString(migrationDirectory.resolve(V88), resource(V88));
        Flyway.configure().dataSource(url, "sa", "").locations("filesystem:" + migrationDirectory).load().migrate();

        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             Statement statement = connection.createStatement()) {
            statement.execute("INSERT INTO sponsors (id, name, since_date) VALUES (1, '테스트 후원자', DATE '2026-09-04')");
            // Same name, different date; different id, same date.
            statement.execute("INSERT INTO sponsors (id, name, since_date) VALUES (2, '테스트 후원자', DATE '2025-01-01')");
            statement.execute("INSERT INTO sponsors (id, name, since_date) VALUES (3, '다른 후원자', DATE '2026-09-04')");

            String v106 = resource(V106);
            statement.execute(v106);

            assertThat(count(statement, "anonymous = TRUE")).isEqualTo(1);
            assertThat(count(statement, "anonymous = TRUE AND id = 1 AND since_date = DATE '2026-09-04'")).isEqualTo(1);
            // Nothing is renamed or deleted.
            assertThat(count(statement, "1 = 1")).isEqualTo(3);
            assertThat(count(statement, "name = '테스트 후원자'")).isEqualTo(2);

            statement.execute("UPDATE sponsors SET updated_at = TIMESTAMP '2000-01-01 00:00:00'");
            statement.execute(v106);
            assertThat(count(statement, "updated_at <> TIMESTAMP '2000-01-01 00:00:00'")).as("rerun touches no row").isZero();
            assertThat(count(statement, "anonymous = TRUE")).isEqualTo(1);
        }
    }

    @Test
    void v107UndoesV106ForThatRowOnlyAndKeepsOtherAnonymousSponsors() throws Exception {
        String url = "jdbc:h2:mem:sponsor_name_for_members;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        Files.writeString(migrationDirectory.resolve(V88), resource(V88));
        Flyway.configure().dataSource(url, "sa", "").locations("filesystem:" + migrationDirectory).load().migrate();

        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             Statement statement = connection.createStatement()) {
            statement.execute("INSERT INTO sponsors (id, name, since_date) VALUES (1, '테스트 후원자', DATE '2026-09-04')");
            // Anonymous by the sponsor's own request: wrong id / wrong date must stay anonymous.
            statement.execute("INSERT INTO sponsors (id, name, since_date, anonymous) VALUES (2, '본인 익명', DATE '2026-09-04', TRUE)");
            statement.execute("INSERT INTO sponsors (id, name, since_date, anonymous) VALUES (3, '날짜 다름', DATE '2025-01-01', TRUE)");
            statement.execute(resource(V106));
            assertThat(count(statement, "id = 1 AND anonymous = TRUE")).isEqualTo(1);

            String v107 = resource(V107);
            statement.execute(v107);

            assertThat(count(statement, "id = 1 AND anonymous = FALSE")).isEqualTo(1);
            assertThat(count(statement, "id IN (2, 3) AND anonymous = TRUE")).isEqualTo(2);
            assertThat(count(statement, "1 = 1")).isEqualTo(3);

            statement.execute("UPDATE sponsors SET updated_at = TIMESTAMP '2000-01-01 00:00:00'");
            statement.execute(v107);
            assertThat(count(statement, "updated_at <> TIMESTAMP '2000-01-01 00:00:00'")).as("rerun touches no row").isZero();
        }
    }

    private static int count(Statement statement, String where) throws Exception {
        try (var rows = statement.executeQuery("SELECT COUNT(*) FROM sponsors WHERE " + where)) {
            rows.next();
            return rows.getInt(1);
        }
    }

    private static String resource(String name) throws Exception {
        try (InputStream input = Objects.requireNonNull(
                AnonymizeSponsorMigrationTest.class.getResourceAsStream("/db/migration/" + name), name)) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
