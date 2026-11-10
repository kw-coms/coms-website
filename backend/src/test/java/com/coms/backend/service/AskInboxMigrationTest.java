package com.coms.backend.service;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;

class AskInboxMigrationTest {
    @Test
    void migrationStartsDisabledAndCanBeReplayedWithoutClearingConfiguredInbox() throws Exception {
        String sql = Files.readString(Path.of("src/main/resources/db/migration/V109__ask_inbox_email.sql"));
        try (var connection = DriverManager.getConnection(
                "jdbc:h2:mem:ask-inbox-migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE site_settings (id BIGINT PRIMARY KEY)");
            statement.execute("INSERT INTO site_settings (id) VALUES (1)");

            statement.execute(sql);
            try (var rows = statement.executeQuery("SELECT ask_inbox_email FROM site_settings WHERE id = 1")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEmpty();
            }

            statement.execute("UPDATE site_settings SET ask_inbox_email = 'inbox@example.com' WHERE id = 1");
            statement.execute(sql);
            statement.execute("INSERT INTO site_settings (id) VALUES (2)");
            try (var rows = statement.executeQuery("SELECT ask_inbox_email FROM site_settings ORDER BY id")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("inbox@example.com");
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEmpty();
                assertThat(rows.next()).isFalse();
            }
        }
    }
}
