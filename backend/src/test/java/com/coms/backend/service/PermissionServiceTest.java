package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.domain.RolePermission;
import com.coms.backend.domain.RolePermissionId;
import com.coms.backend.dto.MyPermissionsResponse;
import com.coms.backend.dto.PermissionMatrixResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RolePermissionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PermissionServiceTest {

    private final RolePermissionRepository repository = mock(RolePermissionRepository.class);
    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final AuditLogService auditLogService = mock(AuditLogService.class);
    private final PermissionService service = new PermissionService(repository, memberRepository, auditLogService);

    @Test
    void adminAuthenticationShortCircuitsWithoutRepositoryAccess() {
        var authentication = new TestingAuthenticationToken("2026000001", "password", "ROLE_ADMIN");

        assertThat(service.has(authentication, Permission.ARCHIVE_MANAGE)).isTrue();

        verify(repository, never()).findById(any());
        verify(memberRepository, never()).findByStudentId(any());
    }

    @Test
    void databaseValueIsCachedAndOverridesEnumDefault() {
        RolePermission row = row(Member.Role.USER, Permission.ARCHIVE_MANAGE, true, "admin");
        when(repository.findById(new RolePermissionId(Member.Role.USER, Permission.ARCHIVE_MANAGE)))
                .thenReturn(Optional.of(row));

        Member user = member(Member.Role.USER);

        assertThat(service.has(user, Permission.ARCHIVE_MANAGE)).isTrue();
        assertThat(service.has(user, Permission.ARCHIVE_MANAGE)).isTrue();

        verify(repository).findById(new RolePermissionId(Member.Role.USER, Permission.ARCHIVE_MANAGE));
    }

    @Test
    void missingDatabaseRowFallsBackToEnumDefault() {
        when(repository.findById(new RolePermissionId(Member.Role.OFFICER, Permission.NOTICE_WRITE)))
                .thenReturn(Optional.empty());
        when(repository.findById(new RolePermissionId(Member.Role.USER, Permission.NOTICE_WRITE)))
                .thenReturn(Optional.empty());

        assertThat(service.has(member(Member.Role.OFFICER), Permission.NOTICE_WRITE)).isTrue();
        assertThat(service.has(member(Member.Role.USER), Permission.NOTICE_WRITE)).isFalse();
    }

    @Test
    void replacePersistsAllEditableRowsRefreshesCacheAndRecordsAuditDiff() {
        when(repository.findById(new RolePermissionId(Member.Role.USER, Permission.ARCHIVE_MANAGE)))
                .thenReturn(Optional.of(row(Member.Role.USER, Permission.ARCHIVE_MANAGE, false, "before")));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(service.has(member(Member.Role.USER), Permission.ARCHIVE_MANAGE)).isFalse();

        PermissionMatrixResponse response = service.replace(Map.of(
                Member.Role.ASSOCIATE, Set.of(),
                Member.Role.USER, Set.of(Permission.ARCHIVE_MANAGE),
                Member.Role.OFFICER, Set.of(Permission.NOTICE_WRITE),
                Member.Role.VICE_PRESIDENT, Set.of(Permission.ARCHIVE_MANAGE)
        ), "2026000001");

        assertThat(response.allowed().get("USER")).containsExactly("archive.manage");
        assertThat(service.has(member(Member.Role.USER), Permission.ARCHIVE_MANAGE)).isTrue();
        verify(repository).saveAll(argThat((Iterable<RolePermission> rows) -> {
            assertThat(rows).hasSize(36);
            assertThat(rows).anySatisfy(row ->
                    assertThat(row.getId()).isEqualTo(new RolePermissionId(Member.Role.USER, Permission.ARCHIVE_MANAGE)));
            return true;
        }));
        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_PERMISSIONS_UPDATE"),
                eq("ROLE_PERMISSIONS"),
                eq(null),
                argThat(detail -> detail.contains("added=USER:archive.manage") && detail.contains("removed=")),
                eq(null)
        );
    }

    @Test
    void matrixOutputsOnlyFourEditableRolesWithDottedPermissionKeysAndMetadata() {
        LocalDateTime updatedAt = LocalDateTime.of(2026, 9, 4, 12, 30);
        when(repository.findAll()).thenReturn(java.util.List.of(
                row(Member.Role.USER, Permission.CLUB_ROOM_VIEW, true, updatedAt, "2026000001"),
                row(Member.Role.VICE_PRESIDENT, Permission.ARCHIVE_MANAGE, true, updatedAt.plusMinutes(1), "2026000002")
        ));

        PermissionMatrixResponse response = service.matrix();

        assertThat(response.roles()).containsExactly("ASSOCIATE", "USER", "OFFICER", "VICE_PRESIDENT");
        assertThat(response.permissions()).extracting(PermissionMatrixResponse.PermissionDescriptor::key)
                .containsExactly(
                        "club_room.view",
                        "community.anonymous_board",
                        "community.moderate",
                        "notice.write",
                        "activity.write",
                        "project.write",
                        "archive.manage",
                        "site_settings.edit",
                        "operations.panel"
                );
        assertThat(response.allowed().get("USER")).contains("club_room.view", "community.anonymous_board");
        assertThat(response.updatedAt()).isEqualTo(updatedAt.plusMinutes(1));
        assertThat(response.updatedBy()).isEqualTo("2026000002");
    }

    @Test
    void effectiveGivesAdminEveryPermissionAsDottedKeysInMyResponse() {
        MyPermissionsResponse response = MyPermissionsResponse.from(member(Member.Role.ADMIN), service.effective(member(Member.Role.ADMIN)));

        assertThat(response.role()).isEqualTo("ADMIN");
        assertThat(response.permissions()).containsExactlyInAnyOrder(
                "club_room.view",
                "community.anonymous_board",
                "community.moderate",
                "notice.write",
                "activity.write",
                "project.write",
                "archive.manage",
                "site_settings.edit",
                "operations.panel"
        );
    }

    private Member member(Member.Role role) {
        Member member = new Member();
        member.setStudentId("2026000001");
        member.setName("테스터");
        member.setEmail(role.name().toLowerCase() + "@example.com");
        member.setPassword("pw");
        member.setRole(role);
        return member;
    }

    private RolePermission row(Member.Role role, Permission permission, boolean allowed, String updatedBy) {
        return row(role, permission, allowed, LocalDateTime.now(), updatedBy);
    }

    private RolePermission row(Member.Role role, Permission permission, boolean allowed, LocalDateTime updatedAt, String updatedBy) {
        RolePermission row = new RolePermission(new RolePermissionId(role, permission));
        row.setAllowed(allowed);
        row.setUpdatedAt(updatedAt);
        row.setUpdatedBy(updatedBy);
        return row;
    }
}
