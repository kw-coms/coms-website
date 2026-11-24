package com.coms.backend.service;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ArchiveVisibilityMigrationTest {
    @TempDir Path migrations;

    @Test
    void existingFilesRemainMembersOnlyAndSelectedMembersHaveReferentialIntegrity() throws Exception {
        String url = "jdbc:h2:mem:archive_visibility_migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            sql.execute("CREATE TABLE members (student_id VARCHAR(255) PRIMARY KEY)");
            sql.execute("CREATE TABLE archive_files (id BIGINT PRIMARY KEY)");
            sql.execute("INSERT INTO archive_files VALUES (1)");
            sql.execute("INSERT INTO members VALUES ('2026000001')");
            try (var source = getClass().getResourceAsStream("/db/migration/V126__archive_visibility.sql")) {
                assertThat(source).isNotNull();
                Files.write(migrations.resolve("V126__archive_visibility.sql"), source.readAllBytes());
            }
            assertThat(Flyway.configure().dataSource(url, "sa", "").locations("filesystem:" + migrations)
                    .baselineOnMigrate(true).load().migrate().success).isTrue();
            sql.execute("INSERT INTO archive_files (id) VALUES (2)");
            try (var rows = sql.executeQuery("SELECT visibility FROM archive_files ORDER BY id")) {
                for (int i = 0; i < 2; i++) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString(1)).isEqualTo("MEMBERS");
                }
                assertThat(rows.next()).isFalse();
            }
            sql.execute("INSERT INTO archive_file_selected_members VALUES (1, '2026000001')");
            assertThatThrownBy(() -> sql.execute("INSERT INTO archive_file_selected_members VALUES (1, 'missing')"))
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> sql.execute("INSERT INTO archive_file_selected_members VALUES (1, '2026000001')"))
                    .isInstanceOf(SQLException.class);
            sql.execute("DELETE FROM members WHERE student_id = '2026000001'");
            try (var rows = sql.executeQuery("SELECT COUNT(*) FROM archive_file_selected_members")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isZero();
            }
        }
    }
}
