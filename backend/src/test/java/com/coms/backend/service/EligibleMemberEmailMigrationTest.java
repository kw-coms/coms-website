package com.coms.backend.service;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;

class EligibleMemberEmailMigrationTest {
    @Test
    void addingEmailColumnTwiceKeepsExistingAndBlankValues() throws Exception {
        String sql;
        try (var resource = getClass().getResourceAsStream("/db/migration/V108__eligible_member_email.sql")) {
            assertThat(resource).isNotNull();
            sql = new String(resource.readAllBytes(), StandardCharsets.UTF_8);
        }
        try (var connection = DriverManager.getConnection("jdbc:h2:mem:eligible_member_email_migration;MODE=PostgreSQL", "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE eligible_members (id BIGINT PRIMARY KEY)");
            statement.execute(sql);
            statement.execute("INSERT INTO eligible_members VALUES (1, 'stored@example.com'), (2, NULL)");
            statement.execute(sql);
            try (var rows = statement.executeQuery("SELECT email FROM eligible_members ORDER BY id")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("stored@example.com");
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isNull();
            }
        }
    }
}
