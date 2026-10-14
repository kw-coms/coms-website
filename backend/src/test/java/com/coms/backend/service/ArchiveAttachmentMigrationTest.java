package com.coms.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.flywaydb.core.Flyway;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;

class ArchiveAttachmentMigrationTest {
    @TempDir
    Path migrationDirectory;

    @Test
    void backfillKeepsExistingPostIdTitleAndPrimaryBlob() throws Exception {
        String url = "jdbc:h2:mem:archive_attachment_migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "")) {
            try (var statement = connection.createStatement()) {
                statement.execute("CREATE TABLE archive_files (id BIGINT PRIMARY KEY, title VARCHAR(200), original_name VARCHAR(255), stored_name VARCHAR(255), mime_type VARCHAR(255), file_size BIGINT)");
                statement.execute("INSERT INTO archive_files VALUES (35, '2026 대롱1 중간 족보 (1)', 'first.pdf', 'old-storage-first', 'application/pdf', 123)");
                statement.execute("INSERT INTO archive_files VALUES (36, '2026 대롱1 중간 족보 (2)', 'second.pdf', 'old-storage-second', 'application/pdf', 456)");
                try (InputStream input = getClass().getResourceAsStream("/db/migration/V99__archive_attachments.sql")) {
                    Files.write(migrationDirectory.resolve("V99__archive_attachments.sql"), input.readAllBytes());
                }
                var result = Flyway.configure().dataSource(url, "sa", "")
                        .locations("filesystem:" + migrationDirectory).baselineOnMigrate(true).load().migrate();
                assertThat(result.success).isTrue();
                assertThat(result.migrationsExecuted).isEqualTo(1);
                try (var rows = statement.executeQuery("SELECT a.id, a.title, t.position, t.stored_name FROM archive_files a JOIN archive_attachments t ON t.archive_file_id = a.id ORDER BY a.id")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getLong(1)).isEqualTo(35);
                    assertThat(rows.getString(2)).isEqualTo("2026 대롱1 중간 족보 (1)");
                    assertThat(rows.getInt(3)).isZero();
                    assertThat(rows.getString(4)).isEqualTo("old-storage-first");
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getLong(1)).isEqualTo(36);
                    assertThat(rows.getString(2)).isEqualTo("2026 대롱1 중간 족보 (2)");
                    assertThat(rows.getString(4)).isEqualTo("old-storage-second");
                    assertThat(rows.next()).isFalse();
                }
            }
        }
    }
}
