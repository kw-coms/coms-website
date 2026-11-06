package com.coms.backend.config;

import com.coms.backend.domain.RichBodyMedia;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;

/** Checks the standalone V102 DDL against the entity without Hibernate generating its table. */
class RichBodyMediaMigrationTest {

    @Test
    @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named = "COMS_PG_TEST_URL", matches = ".+")
    void postgresMemberDeletionPreservesPendingAndAttachedMedia() throws Exception {
        try (var connection = DriverManager.getConnection(System.getenv("COMS_PG_TEST_URL"),
                System.getenv().getOrDefault("COMS_PG_TEST_USER", "postgres"),
                System.getenv().getOrDefault("COMS_PG_TEST_PASSWORD", "postgres"))) {
            connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) {
                // A transaction-local schema keeps the migration test isolated from other fixtures.
                String schema = "rich_media_" + java.util.UUID.randomUUID().toString().replace("-", "");
                statement.execute("CREATE SCHEMA " + schema);
                statement.execute("SET LOCAL search_path TO " + schema);
                assertMemberDeletionPreservesMedia(connection);
            } finally {
                connection.rollback();
            }
        }
    }

    @Test
    void h2MemberDeletionPreservesPendingAndAttachedMedia() throws Exception {
        try (var connection = DriverManager.getConnection(
                "jdbc:h2:mem:rich_body_media_delete;MODE=PostgreSQL", "sa", "")) {
            assertMemberDeletionPreservesMedia(connection);
        }
    }

    private void assertMemberDeletionPreservesMedia(java.sql.Connection connection) throws Exception {
        try (var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE members (id BIGINT PRIMARY KEY)");
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V102__rich_body_media.sql"));
            statement.execute("INSERT INTO members (id) VALUES (100)");
            statement.execute("""
                    INSERT INTO rich_body_media (kind, scope, stored_name, original_name, content_type,
                                                 size_bytes, uploader_id, owner_id, attached_at)
                    VALUES ('IMAGE', 'NOTICE', 'pending', 'pending.png', 'image/png', 10, 100, NULL, NULL),
                           ('IMAGE', 'NOTICE', 'attached', 'attached.png', 'image/png', 10, 100, 50, CURRENT_TIMESTAMP)
                    """);
            try (var indexes = connection.getMetaData().getIndexInfo(null, null,
                    connection.getMetaData().storesUpperCaseIdentifiers() ? "RICH_BODY_MEDIA" : "rich_body_media", false, false)) {
                boolean uploaderIndexed = false;
                while (indexes.next()) {
                    if ("idx_rich_body_media_uploader".equalsIgnoreCase(indexes.getString("INDEX_NAME"))
                            && "uploader_id".equalsIgnoreCase(indexes.getString("COLUMN_NAME"))) uploaderIndexed = true;
                }
                assertThat(uploaderIndexed).isTrue();
            }
            assertThat(statement.executeUpdate("DELETE FROM members WHERE id = 100")).isEqualTo(1);
            try (var rows = statement.executeQuery("SELECT uploader_id, owner_id, attached_at FROM rich_body_media ORDER BY id")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getObject("uploader_id")).isNull();
                assertThat(rows.getObject("owner_id")).isNull();
                assertThat(rows.getObject("attached_at")).isNull();
                assertThat(rows.next()).isTrue();
                assertThat(rows.getObject("uploader_id")).isNull();
                assertThat(rows.getLong("owner_id")).isEqualTo(50L);
                assertThat(rows.getObject("attached_at")).isNotNull();
                assertThat(rows.next()).isFalse();
            }
        }
    }

    @Test
    void v102ExecutesAndMatchesHibernateValidate() throws Exception {
        String url = "jdbc:h2:mem:rich_body_media_v102;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE members (id BIGINT PRIMARY KEY)");
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V102__rich_body_media.sql"));
            try (var columns = connection.getMetaData().getColumns(null, null, "RICH_BODY_MEDIA", null)) {
                int count = 0;
                while (columns.next()) count++;
                assertThat(count).isEqualTo(12);
            }
        }

        var registry = new StandardServiceRegistryBuilder()
                .applySetting("jakarta.persistence.jdbc.url", url)
                .applySetting("jakarta.persistence.jdbc.user", "sa")
                .applySetting("jakarta.persistence.jdbc.password", "")
                .applySetting("hibernate.hbm2ddl.auto", "validate")
                .build();
        try {
            var metadata = new MetadataSources(registry).addAnnotatedClass(RichBodyMedia.class).buildMetadata();
            try (var sessionFactory = metadata.buildSessionFactory()) {
                assertThat(sessionFactory.isOpen()).isTrue();
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }
}
