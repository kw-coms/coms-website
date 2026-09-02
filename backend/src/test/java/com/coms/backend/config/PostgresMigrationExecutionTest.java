package com.coms.backend.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs every Flyway migration from an empty database against a real Postgres.
 *
 * <p>The rest of the suite runs on H2 with {@code ddl-auto=create-drop}, so until now nothing
 * actually executed the migration scripts — a migration could be syntactically valid Postgres and
 * still fail on deploy (or, worse, disagree with the entity mapping) and CI would stay green.
 *
 * <p>Only this test needs Postgres; it is skipped unless {@code COMS_PG_TEST_URL} is set, so local
 * {@code ./gradlew test} keeps working with no external database. CI supplies it from a
 * {@code services: postgres} container.
 */
@EnabledIfEnvironmentVariable(named = "COMS_PG_TEST_URL", matches = ".+")
class PostgresMigrationExecutionTest {

    @Test
    void everyMigrationAppliesCleanlyFromAnEmptyDatabase() {
        DataSource dataSource = new DriverManagerDataSource(
                System.getenv("COMS_PG_TEST_URL"),
                System.getenv().getOrDefault("COMS_PG_TEST_USER", "postgres"),
                System.getenv().getOrDefault("COMS_PG_TEST_PASSWORD", "postgres"));

        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .cleanDisabled(false)
                .load();
        flyway.clean();

        MigrateResult result = flyway.migrate();

        assertThat(result.success).isTrue();
        assertThat(result.migrationsExecuted).isGreaterThan(0);

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        assertThat(columnExists(jdbc, "refresh_sessions", "family")).isTrue();
        assertThat(columnExists(jdbc, "eligible_members", "initial_role")).isTrue();
        // Hibernate validates the schema on boot, so the entity defaults and the migration
        // defaults must agree — a mismatch here is exactly the kind of drift this test exists for.
        assertThat(jdbc.queryForObject(
                "SELECT column_default FROM information_schema.columns "
                        + "WHERE table_name = 'eligible_members' AND column_name = 'initial_role'",
                String.class)).contains("USER");
    }

    private static boolean columnExists(JdbcTemplate jdbc, String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
