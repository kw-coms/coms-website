package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.junit.jupiter.api.extension.ExtendWith;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:permission-legacy-key-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@ExtendWith(OutputCaptureExtension.class)
class PermissionLegacyKeyIntegrationTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PermissionService permissionService;

    @Test
    void unknownStoredPermissionIsIgnoredButApiKeyParsingRemainsStrict(CapturedOutput output) {
        // An old dev database predates Hibernate's enum check for the current permissions.
        jdbc.queryForList("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'ROLE_PERMISSIONS' AND constraint_type = 'CHECK'", String.class)
                .forEach(name -> jdbc.execute("ALTER TABLE role_permissions DROP CONSTRAINT " + name));
        jdbc.update("INSERT INTO role_permissions (role, permission, allowed, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                "USER", "archive.manage", true);
        try {
            permissionService.selfHealMissingRows();
            var current = permissionService.matrix();
            assertThat(current.allowed().get("USER")).doesNotContain("archive.manage");
            assertThat(current.allowed().get("OFFICER")).contains("notice.write");
            var saved = permissionService.replace(Map.of(
                    Member.Role.ASSOCIATE, Set.of(),
                    Member.Role.USER, Set.of(Permission.ARCHIVE_DELETE),
                    Member.Role.OFFICER, Set.of(Permission.NOTICE_WRITE),
                    Member.Role.VICE_PRESIDENT, Set.of()
            ), "2026000001", current.updatedAt());
            assertThat(saved.allowed().get("USER")).containsExactly("archive.delete");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM role_permissions WHERE permission = 'archive.manage'", Integer.class))
                    .isEqualTo(1);
            assertThat(output.getOut()).contains("WARN", "Ignoring unknown stored role permission key: archive.manage");
            assertThatThrownBy(() -> Permission.fromKey("archive.manage"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(400));
        } finally {
            jdbc.update("DELETE FROM role_permissions WHERE permission = ?", "archive.manage");
        }
    }
}
