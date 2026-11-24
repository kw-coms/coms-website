package com.coms.backend.service;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;

class ArchivePermissionMigrationTest {
    @TempDir Path migrationDirectory;

    @Test
    void existingGrantsAndDenialsBecomeAllFourPermissions() throws Exception {
        String url = "jdbc:h2:mem:archive_permission_migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "")) {
            try (var statement = connection.createStatement()) {
                statement.execute("CREATE TABLE members (student_id VARCHAR(255) PRIMARY KEY)");
                statement.execute("CREATE TABLE role_permissions (role VARCHAR(20), permission VARCHAR(60), allowed BOOLEAN, updated_at TIMESTAMP, updated_by VARCHAR(30), PRIMARY KEY (role, permission))");
                statement.execute("INSERT INTO role_permissions VALUES ('USER', 'archive.manage', true, TIMESTAMP '2026-01-02 03:04:05', '2026000001')");
                statement.execute("INSERT INTO role_permissions VALUES ('OFFICER', 'archive.manage', false, TIMESTAMP '2026-01-03 03:04:05', '2026000002')");
                try (var source = getClass().getResourceAsStream("/db/migration/V124__archive_permissions_and_member_overrides.sql")) {
                    assertThat(source).isNotNull();
                    Files.write(migrationDirectory.resolve("V124__archive_permissions_and_member_overrides.sql"), source.readAllBytes());
                }
                assertThat(Flyway.configure().dataSource(url, "sa", "")
                        .locations("filesystem:" + migrationDirectory).baselineOnMigrate(true).load().migrate().success).isTrue();
                try (var rows = statement.executeQuery("SELECT role, permission, allowed, updated_at, updated_by FROM role_permissions ORDER BY role, permission")) {
                    for (String role : new String[]{"OFFICER", "USER"}) {
                        for (String key : new String[]{"archive.author_change", "archive.delete", "archive.edit_any", "archive.visibility"}) {
                            assertThat(rows.next()).isTrue();
                            assertThat(rows.getString(1)).isEqualTo(role);
                            assertThat(rows.getString(2)).isEqualTo(key);
                            assertThat(rows.getBoolean(3)).isEqualTo(role.equals("USER"));
                            assertThat(rows.getTimestamp(4).toLocalDateTime()).isEqualTo(
                                    java.time.LocalDateTime.parse(role.equals("USER") ? "2026-01-02T03:04:05" : "2026-01-03T03:04:05"));
                            assertThat(rows.getString(5)).isEqualTo(role.equals("USER") ? "2026000001" : "2026000002");
                        }
                    }
                    assertThat(rows.next()).isFalse();
                }
            }
        }
        try (var connection = DriverManager.getConnection(url, "sa", "")) {
            try (var columns = connection.getMetaData().getColumns(null, null, "MEMBER_PERMISSION_OVERRIDES", null)) {
                int count = 0;
                while (columns.next()) count++;
                assertThat(count).isEqualTo(5);
            }
        }
    }
}
