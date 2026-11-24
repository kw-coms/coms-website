package com.coms.backend.config;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.test.context.DynamicPropertyRegistry;

import javax.sql.DataSource;
import java.util.UUID;

public abstract class StudyConcurrencyDatabase {
    public static void configure(DynamicPropertyRegistry registry, String schema) {
        String url = System.getenv("COMS_PG_TEST_URL");
        if (url == null || url.isBlank()) {
            registry.add("spring.datasource.url",
                    () -> "jdbc:h2:mem:" + schema + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
            return;
        }

        String isolatedSchema = schema + "_" + UUID.randomUUID().toString().substring(0, 8);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("COMS_PG_TEST_USER", "postgres"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("COMS_PG_TEST_PASSWORD", "postgres"));
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.hikari.schema", () -> isolatedSchema);
        registry.add("spring.jpa.database-platform", () -> "org.hibernate.dialect.PostgreSQLDialect");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.jpa.defer-datasource-initialization", () -> "false");
        registry.add("spring.sql.init.mode", () -> "never");
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.flyway.default-schema", () -> isolatedSchema);
    }

    @AfterAll
    static void cleanPostgresSchema(@Autowired DataSource dataSource, @Autowired Environment environment) {
        String schema = environment.getProperty("spring.flyway.default-schema");
        if (schema != null && schema.matches("(study_|attendance_)[a-z_]+_[a-f0-9]{8}")) {
            Flyway.configure().dataSource(dataSource).defaultSchema(schema).cleanDisabled(false).load().clean();
        }
    }
}
