package com.coms.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.flywaydb.core.Flyway;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;

class EligibleMemberDepartmentMigrationTest {
    private static final String[] MIGRATIONS = {
            "V100__eligible_member_department.sql",
            "V101__backfill_eligible_member_department.sql",
    };

    @TempDir
    Path migrationDirectory;

    @Test
    void backfillPrefersMemberThenApplicationThenAcceptedPromotionLog() throws Exception {
        String url = "jdbc:h2:mem:eligible_member_department_migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            createSourceTables(statement);
            statement.execute("CREATE TABLE eligible_members (id BIGINT PRIMARY KEY, name VARCHAR(255), student_id VARCHAR(255))");
            statement.execute("INSERT INTO eligible_members VALUES "
                    + "(1, '가상일', '2026990101'), (2, '가상이', '2026990102'), (3, '가상삼', '2026990103'), "
                    + "(4, '가상사', '2026990104'), (5, '가상오', '2026990105'), (6, '가상육', '2026990106'), "
                    + "(7, '가상칠', NULL), (8, '가상팔', '2026990108'), (9, '가상구', '2026990109')");
            statement.execute("INSERT INTO members VALUES (1, '2026990101', '  컴퓨터정보공학부  '), (2, '2026990102', '   '), "
                    + "(4, '2026990104', '" + "가".repeat(101) + "')");
            statement.execute("INSERT INTO recruit_applications VALUES "
                    + "(1, '가상일', '2026990101', '로봇학부', TIMESTAMP '2026-01-03 00:00:00'), "
                    + "(2, '가상이', '2026990102', '전자공학과', TIMESTAMP '2026-01-01 00:00:00'), "
                    + "(3, '  가상이 ', '2026990102', '  소프트웨어학부  ', TIMESTAMP '2026-01-02 00:00:00'), "
                    + "(4, '가상삼', '2026990103', '   ', TIMESTAMP '2026-01-04 00:00:00'), "
                    // Same student id, someone else's name: never copied onto the roster row.
                    + "(5, '도용자', '2026990108', '도용학부', TIMESTAMP '2026-03-01 00:00:00'), "
                    + "(6, '다른사람', '2026990109', '남의학부', TIMESTAMP '2026-03-01 00:00:00')");
            statement.execute("INSERT INTO recruit_promotion_logs VALUES "
                    + "(1, '가상일', '2026990101', '로그보다회원', 'ACCEPTED', TIMESTAMP '2026-02-01 00:00:00'), "
                    + "(2, '가상이', '2026990102', '로그보다지원서', 'ACCEPTED', TIMESTAMP '2026-02-01 00:00:00'), "
                    + "(3, '가상오', '2026990105', '이전학부', 'ACCEPTED', TIMESTAMP '2026-01-01 00:00:00'), "
                    + "(4, '가상오', '2026990105', '  최신학부  ', 'ACCEPTED', TIMESTAMP '2026-01-02 00:00:00'), "
                    + "(5, '가상오', '2026990105', '거절학부', 'REJECTED', TIMESTAMP '2026-01-03 00:00:00'), "
                    + "(6, '가상오', '2026990105', '   ', 'ACCEPTED', TIMESTAMP '2026-01-04 00:00:00'), "
                    + "(7, '가상육', '2026990106', '거절전용', 'REJECTED', TIMESTAMP '2026-01-05 00:00:00'), "
                    + "(8, '가상칠', NULL, '학번없음', 'ACCEPTED', TIMESTAMP '2026-01-06 00:00:00'), "
                    + "(9, '가상팔', '2026990108', '승격학부', 'ACCEPTED', TIMESTAMP '2026-02-01 00:00:00'), "
                    + "(10, '다른사람', '2026990109', '남의로그', 'ACCEPTED', TIMESTAMP '2026-02-01 00:00:00')");

            var result = migrate(url);

            assertThat(result.success).isTrue();
            assertThat(result.migrationsExecuted).isEqualTo(2);
            try (var rows = statement.executeQuery("SELECT department FROM eligible_members ORDER BY id")) {
                assertThat(nextDepartment(rows)).isEqualTo("컴퓨터정보공학부");   // member profile wins
                assertThat(nextDepartment(rows)).isEqualTo("소프트웨어학부");     // latest application, name trimmed
                assertThat(nextDepartment(rows)).isNull();                         // blank sources only
                assertThat(nextDepartment(rows)).isEqualTo("가".repeat(100));     // cut to the column size
                assertThat(nextDepartment(rows)).isEqualTo("최신학부");           // latest accepted, non-blank log
                assertThat(nextDepartment(rows)).isNull();                         // rejected logs are ignored
                assertThat(nextDepartment(rows)).isNull();                         // no student id, nothing to match
                assertThat(nextDepartment(rows)).isEqualTo("승격학부");           // other-name application skipped
                assertThat(nextDepartment(rows)).isNull();                         // only other-name sources
                assertThat(rows.next()).isFalse();
            }
        }
    }

    @Test
    void backfillDoesNotOverwriteExistingDepartment() throws Exception {
        String url = "jdbc:h2:mem:eligible_member_department_prefilled;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            createSourceTables(statement);
            // The column already exists: V100 must be a no-op, V101 must leave the value alone.
            statement.execute("CREATE TABLE eligible_members (id BIGINT PRIMARY KEY, name VARCHAR(255), student_id VARCHAR(255), department VARCHAR(100))");
            statement.execute("INSERT INTO eligible_members VALUES (1, '가상칠', '2026990107', '기존학부')");
            statement.execute("INSERT INTO members VALUES (1, '2026990107', '회원학부')");
            statement.execute("INSERT INTO recruit_applications VALUES (1, '가상칠', '2026990107', '지원학부', TIMESTAMP '2026-01-01 00:00:00')");
            statement.execute("INSERT INTO recruit_promotion_logs VALUES (1, '가상칠', '2026990107', '승격학부', 'ACCEPTED', TIMESTAMP '2026-02-01 00:00:00')");

            assertThat(migrate(url).success).isTrue();
            try (var rows = statement.executeQuery("SELECT department FROM eligible_members WHERE id = 1")) {
                assertThat(nextDepartment(rows)).isEqualTo("기존학부");
            }
        }
    }

    private static void createSourceTables(java.sql.Statement statement) throws Exception {
        statement.execute("CREATE TABLE members (id BIGINT PRIMARY KEY, student_id VARCHAR(255), department VARCHAR(255))");
        statement.execute("CREATE TABLE recruit_applications (id BIGINT PRIMARY KEY, name VARCHAR(255), student_id VARCHAR(255), "
                + "department VARCHAR(255), submitted_at TIMESTAMP)");
        statement.execute("CREATE TABLE recruit_promotion_logs (id BIGINT PRIMARY KEY, name VARCHAR(255), student_id VARCHAR(255), "
                + "department VARCHAR(255), decision VARCHAR(20), promoted_at TIMESTAMP)");
    }

    private org.flywaydb.core.api.output.MigrateResult migrate(String url) throws Exception {
        for (String migration : MIGRATIONS) {
            try (InputStream input = Objects.requireNonNull(
                    getClass().getResourceAsStream("/db/migration/" + migration))) {
                Files.write(migrationDirectory.resolve(migration), input.readAllBytes());
            }
        }
        return Flyway.configure().dataSource(url, "sa", "")
                .locations("filesystem:" + migrationDirectory).baselineOnMigrate(true).load().migrate();
    }

    private static String nextDepartment(java.sql.ResultSet rows) throws Exception {
        assertThat(rows.next()).isTrue();
        return rows.getString(1);
    }
}
