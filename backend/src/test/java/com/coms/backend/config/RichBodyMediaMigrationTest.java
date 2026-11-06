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
    void v102ExecutesAndMatchesHibernateValidate() throws Exception {
        String url = "jdbc:h2:mem:rich_body_media_v102;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            statement.execute("CREATE TABLE members (id BIGINT PRIMARY KEY)");
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V102__rich_body_media.sql"));
            try (var columns = connection.getMetaData().getColumns(null, null, "RICH_BODY_MEDIA", null)) {
                int count = 0;
                while (columns.next()) count++;
                assertThat(count).isEqualTo(11);
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
