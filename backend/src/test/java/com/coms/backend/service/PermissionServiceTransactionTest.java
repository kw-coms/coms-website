package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.domain.RolePermissionId;
import com.coms.backend.repository.RolePermissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@code replace()} must not swap the in-memory permission matrix cache until the surrounding
 * transaction actually commits — otherwise a rollback would leave the cache serving a matrix that
 * was never persisted, so {@code allows()} checks taken afterward would silently disagree with the
 * database. Mirrors {@link SponsorImageDeletionTransactionTest}'s use of a bare
 * {@link TransactionTemplate} to force a rollback around a service call.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:permission-service-txn-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class PermissionServiceTransactionTest {

    @Autowired
    private PermissionService permissionService;

    @Autowired
    private RolePermissionRepository rolePermissionRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        rolePermissionRepository.deleteAll();
        permissionService.invalidate();
    }

    @Test
    void rolledBackReplaceLeavesTheCacheAndDatabaseUnchanged() {
        // ARCHIVE_MANAGE defaults to VICE_PRESIDENT only, so USER starts out disallowed.
        assertThat(permissionService.allows(Member.Role.USER, Permission.ARCHIVE_MANAGE)).isFalse();

        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            permissionService.replace(matrixGranting(Member.Role.USER, Permission.ARCHIVE_MANAGE), "2026000001");
            throw new RuntimeException("force rollback after the write");
        })).hasMessage("force rollback after the write");

        assertThat(rolePermissionRepository.findAll()).isEmpty();
        assertThat(permissionService.allows(Member.Role.USER, Permission.ARCHIVE_MANAGE)).isFalse();
    }

    @Test
    void committedReplaceUpdatesTheCache() {
        permissionService.replace(matrixGranting(Member.Role.USER, Permission.ARCHIVE_MANAGE), "2026000001");

        assertThat(permissionService.allows(Member.Role.USER, Permission.ARCHIVE_MANAGE)).isTrue();
    }

    @Test
    void deletingARowDeniesUntilSelfHealReseedsIt() {
        // ARCHIVE_MANAGE defaults to VICE_PRESIDENT only.
        permissionService.replace(matrixGranting(Member.Role.VICE_PRESIDENT, Permission.ARCHIVE_MANAGE), "2026000001");
        assertThat(permissionService.allows(Member.Role.VICE_PRESIDENT, Permission.ARCHIVE_MANAGE)).isTrue();

        rolePermissionRepository.deleteById(new RolePermissionId(Member.Role.VICE_PRESIDENT, Permission.ARCHIVE_MANAGE));
        permissionService.invalidate();

        assertThat(permissionService.allows(Member.Role.VICE_PRESIDENT, Permission.ARCHIVE_MANAGE)).isFalse();

        permissionService.selfHealMissingRows();

        assertThat(permissionService.allows(Member.Role.VICE_PRESIDENT, Permission.ARCHIVE_MANAGE)).isTrue();
    }

    private Map<Member.Role, Set<Permission>> matrixGranting(Member.Role grantedRole, Permission permission) {
        Map<Member.Role, Set<Permission>> allowed = new EnumMap<>(Member.Role.class);
        for (Member.Role role : PermissionService.editableRoles()) {
            allowed.put(role, role == grantedRole ? EnumSet.of(permission) : EnumSet.noneOf(Permission.class));
        }
        return allowed;
    }
}
