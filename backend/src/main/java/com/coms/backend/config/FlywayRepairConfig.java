package com.coms.backend.config;

import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.util.Arrays;

@Configuration
@Profile("prod")
public class FlywayRepairConfig {

    private static final Logger log = LoggerFactory.getLogger(FlywayRepairConfig.class);

    /**
     * A failed migration may have already applied part of its SQL, so silently wiping the
     * failed history row and re-running it can corrupt data. By default we refuse to start
     * and require an operator to back up the DB and repair deliberately; setting
     * {@code coms.flyway.auto-repair=true} restores the old self-healing behaviour via
     * Flyway's own {@code repair()}.
     */
    @Bean
    public FlywayMigrationStrategy failFastOnFailedMigrations(
            @Value("${coms.flyway.auto-repair:false}") boolean autoRepair) {
        return flyway -> {
            MigrationInfo[] applied = flyway.info().all();
            boolean hasFailed = Arrays.stream(applied)
                    .anyMatch(info -> info.getState() == MigrationState.FAILED);
            if (hasFailed) {
                if (!autoRepair) {
                    throw new IllegalStateException(
                            "Flyway history contains a failed migration. Back up the database, "
                            + "inspect flyway_schema_history, and repair manually — or restart "
                            + "with coms.flyway.auto-repair=true to run Flyway repair automatically.");
                }
                log.warn("Failed Flyway migration detected; running flyway.repair() because coms.flyway.auto-repair=true.");
                flyway.repair();
            }
            flyway.migrate();
        };
    }
}
