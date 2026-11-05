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
    @TempDir
    Path migrationDirectory;

    @Test
    void backfillPrefersMemberThenApplicationThenAcceptedPromotionLog() throws Exception {
        String url = "jdbc:h2:mem:eligible_member_department_migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE eligible_members (id BIGINT PRIMARY KEY, student_id VARCHAR(255))");
            statement.execute("CREATE TABLE members (id BIGINT PRIMARY KEY, student_id VARCHAR(255), department VARCHAR(255))");
            statement.execute("CREATE TABLE recruit_applications (id BIGINT PRIMARY KEY, student_id VARCHAR(255), department VARCHAR(255), submitted_at TIMESTAMP)");
            statement.execute("CREATE TABLE recruit_promotion_logs (id BIGINT PRIMARY KEY, student_id VARCHAR(255), department VARCHAR(255), decision VARCHAR(20), promoted_at TIMESTAMP)");
            statement.execute("INSERT INTO eligible_members VALUES (1, '2026990101'), (2, '2026990102'), (3, '2026990103'), (4, '2026990104'), "
                    + "(5, '2026990105'), (6, '2026990106'), (7, NULL)");
            statement.execute("INSERT INTO members VALUES (1, '2026990101', '  컴퓨터정보공학부  '), (2, '2026990102', '   '), "
                    + "(4, '2026990104', '" + "가".repeat(101) + "')");
            statement.execute("INSERT INTO recruit_applications VALUES "
                    + "(1, '2026990101', '로봇학부', TIMESTAMP '2026-01-03 00:00:00'), "
                    + "(2, '2026990102', '전자공학과', TIMESTAMP '2026-01-01 00:00:00'), "
                    + "(3, '2026990102', '  소프트웨어학부  ', TIMESTAMP '2026-01-02 00:00:00'), "
                    + "(4, '2026990103', '   ', TIMESTAMP '2026-01-04 00:00:00')");
            statement.execute("INSERT INTO recruit_promotion_logs VALUES "
                    + "(1, '2026990101', '로그보다회원', 'ACCEPTED', TIMESTAMP '2026-02-01 00:00:00'), "
                    + "(2, '2026990102', '로그보다지원서', 'ACCEPTED', TIMESTAMP '2026-02-01 00:00:00'), "
                    + "(3, '2026990105', '이전학부', 'ACCEPTED', TIMESTAMP '2026-01-01 00:00:00'), "
                    + "(4, '2026990105', '  최신학부  ', 'ACCEPTED', TIMESTAMP '2026-01-02 00:00:00'), "
                    + "(5, '2026990105', '거절학부', 'REJECTED', TIMESTAMP '2026-01-03 00:00:00'), "
                    + "(6, '2026990105', '   ', 'ACCEPTED', TIMESTAMP '2026-01-04 00:00:00'), "
                    + "(7, '2026990106', '거절전용', 'REJECTED', TIMESTAMP '2026-01-05 00:00:00'), "
                    + "(8, NULL, '학번없음', 'ACCEPTED', TIMESTAMP '2026-01-06 00:00:00')");
            try (InputStream input = Objects.requireNonNull(
                    getClass().getResourceAsStream("/db/migration/V100__eligible_member_department.sql"))) {
                Files.write(migrationDirectory.resolve("V100__eligible_member_department.sql"), input.readAllBytes());
            }

            var result = Flyway.configure().dataSource(url, "sa", "")
                    .locations("filesystem:" + migrationDirectory).baselineOnMigrate(true).load().migrate();

            assertThat(result.success).isTrue();
            assertThat(result.migrationsExecuted).isEqualTo(1);
            try (var rows = statement.executeQuery(
                    "SELECT student_id, department FROM eligible_members ORDER BY id")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("2026990101");
                assertThat(rows.getString(2)).isEqualTo("컴퓨터정보공학부");
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("2026990102");
                assertThat(rows.getString(2)).isEqualTo("소프트웨어학부");
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("2026990103");
                assertThat(rows.getString(2)).isNull();
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("2026990104");
                assertThat(rows.getString(2)).isEqualTo("가".repeat(100));
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(2)).isEqualTo("최신학부");
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(2)).isNull();
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isNull();
                assertThat(rows.getString(2)).isNull();
                assertThat(rows.next()).isFalse();
            }
        }
    }

    @Test
    void backfillDoesNotOverwriteExistingDepartment() throws Exception {
        String url = "jdbc:h2:mem:eligible_member_department_prefilled;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE eligible_members (id BIGINT PRIMARY KEY, student_id VARCHAR(255), department VARCHAR(100))");
            statement.execute("CREATE TABLE members (id BIGINT PRIMARY KEY, student_id VARCHAR(255), department VARCHAR(255))");
            statement.execute("CREATE TABLE recruit_applications (id BIGINT PRIMARY KEY, student_id VARCHAR(255), department VARCHAR(255), submitted_at TIMESTAMP)");
            statement.execute("CREATE TABLE recruit_promotion_logs (id BIGINT PRIMARY KEY, student_id VARCHAR(255), department VARCHAR(255), decision VARCHAR(20), promoted_at TIMESTAMP)");
            statement.execute("INSERT INTO eligible_members VALUES (1, '2026990107', '기존학부')");
            statement.execute("INSERT INTO members VALUES (1, '2026990107', '회원학부')");
            statement.execute("INSERT INTO recruit_applications VALUES (1, '2026990107', '지원학부', TIMESTAMP '2026-01-01 00:00:00')");
            statement.execute("INSERT INTO recruit_promotion_logs VALUES (1, '2026990107', '승격학부', 'ACCEPTED', TIMESTAMP '2026-02-01 00:00:00')");
            try (InputStream input = Objects.requireNonNull(
                    getClass().getResourceAsStream("/db/migration/V100__eligible_member_department.sql"))) {
                String sql = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
                Files.writeString(migrationDirectory.resolve("V100__eligible_member_department.sql"),
                        sql.substring(sql.indexOf("-- Prefer the current member profile")));
            }
            assertThat(Flyway.configure().dataSource(url, "sa", "")
                    .locations("filesystem:" + migrationDirectory).baselineOnMigrate(true).load().migrate().success).isTrue();
            try (var rows = statement.executeQuery("SELECT department FROM eligible_members WHERE id = 1")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("기존학부");
            }
        }
    }
}
