package com.coms.backend.config;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.domain.RolePermissionId;
import com.coms.backend.repository.RolePermissionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;

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

    @Autowired
    private RolePermissionRepository rolePermissionRepository;

    @Test
    void latestProjectAndSiteSettingsMigrationsExecuteInPostgresMode() throws Exception {
        try (var connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V80__club_project_author_nullable.sql"));
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V81__site_settings.sql"));
            // Replayed on top of the hibernate-generated schema: both are written idempotently
            // (IF NOT EXISTS) and carry DEFAULTs on their NOT NULL columns, so re-running them
            // over an existing table is a no-op rather than an error.
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V86__refresh_sessions.sql"));
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V87__eligible_member_initial_role.sql"));
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V88__sponsors.sql"));
            executeV90WithH2OnConflictAdapter();
        }

        String initialRoleNullable = jdbcTemplate.queryForObject(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'ELIGIBLE_MEMBERS' AND column_name = 'INITIAL_ROLE'
                """,
                String.class
        );
        assertThat(initialRoleNullable).isEqualToIgnoringCase("NO");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM refresh_sessions", Integer.class)).isZero();

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

        // V88: the sponsor tables replay cleanly and seed the three default tiers plus the
        // single settings row, without duplicating them when re-run.
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sponsors", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sponsor_images", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sponsor_tiers", Integer.class)).isEqualTo(3);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sponsor_page_settings WHERE id = 1", Integer.class)).isEqualTo(1);

        // V90: role permission rows replay cleanly over Hibernate schema, keep NOT NULL
        // defaults, and seed the four editable roles x nine permissions exactly once.
        String v90 = new ClassPathResource("db/migration/V90__role_permissions.sql").getContentAsString(StandardCharsets.UTF_8);
        assertThat(v90).contains("INSERT INTO role_permissions (role, permission, allowed) VALUES");
        assertThat(v90).contains("ON CONFLICT (role, permission) DO NOTHING");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM role_permissions", Integer.class)).isEqualTo(36);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM role_permissions WHERE permission = 'notice.write'",
                Integer.class
        )).isEqualTo(4);
        assertThat(rolePermissionRepository.findById(new RolePermissionId(Member.Role.OFFICER, Permission.NOTICE_WRITE)))
                .isPresent()
                .get()
                .extracting(row -> row.getId().getPermission(), row -> row.isAllowed())
                .containsExactly(Permission.NOTICE_WRITE, true);
        assertThat(jdbcTemplate.queryForObject(
                """
                SELECT column_default
                FROM information_schema.columns
                WHERE table_name = 'ROLE_PERMISSIONS' AND column_name = 'ALLOWED'
                """,
                String.class
        )).containsIgnoringCase("false");
        assertThat(jdbcTemplate.queryForObject(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'ROLE_PERMISSIONS' AND column_name = 'UPDATED_AT'
                """,
                String.class
        )).isEqualToIgnoringCase("NO");
    }

    private void executeV90WithH2OnConflictAdapter() throws java.io.IOException {
        String sql = new ClassPathResource("db/migration/V90__role_permissions.sql")
                .getContentAsString(StandardCharsets.UTF_8);
        jdbcTemplate.execute(sql.substring(0, sql.indexOf("INSERT INTO role_permissions")));
        String values = sql.substring(sql.indexOf("VALUES") + "VALUES".length(), sql.indexOf("ON CONFLICT")).trim();
        jdbcTemplate.execute("""
                INSERT INTO role_permissions (role, permission, allowed)
                SELECT source.role, source.permission, source.allowed
                FROM (VALUES
                """ + values + """
                ) AS source(role, permission, allowed)
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM role_permissions existing
                    WHERE existing.role = source.role AND existing.permission = source.permission
                )
                """);
    }
}
