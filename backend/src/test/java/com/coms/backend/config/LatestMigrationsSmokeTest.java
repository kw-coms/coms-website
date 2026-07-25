package com.coms.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:latest-migrations-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@Transactional
class LatestMigrationsSmokeTest {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void latestProjectAndSiteSettingsMigrationsExecuteInPostgresMode() throws Exception {
        try (var connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V80__club_project_author_nullable.sql"));
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V81__site_settings.sql"));
        }

        Integer settingsRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM site_settings WHERE id = 1",
                Integer.class
        );
        String authorNullable = jdbcTemplate.queryForObject(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'CLUB_PROJECTS' AND column_name = 'MADE_BY'
                """,
                String.class
        );

        assertThat(settingsRows).isEqualTo(1);
        assertThat(authorNullable).isEqualToIgnoringCase("YES");
    }
}
