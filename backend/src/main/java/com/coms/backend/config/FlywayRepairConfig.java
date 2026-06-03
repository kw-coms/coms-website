package com.coms.backend.config;

import org.flywaydb.core.Flyway;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

@Configuration
@Profile("prod")
public class FlywayRepairConfig {

    @Bean
    public FlywayMigrationStrategy cleanFailedAndMigrate() {
        return flyway -> {
            DataSource ds = flyway.getConfiguration().getDataSource();
            try (Connection conn = ds.getConnection(); Statement stmt = conn.createStatement()) {
                stmt.execute("DELETE FROM flyway_schema_history WHERE success = false");
            } catch (Exception ignored) {
                // Table may not exist on a truly fresh DB — safe to ignore
            }
            flyway.migrate();
        };
    }
}
