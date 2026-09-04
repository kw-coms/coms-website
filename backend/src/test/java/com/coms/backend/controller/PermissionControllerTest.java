package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.dto.PermissionMatrixResponse;
import com.coms.backend.dto.PermissionMatrixUpdateRequest;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.service.PermissionService;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PermissionControllerTest {

    private final PermissionService permissionService = mock(PermissionService.class);
    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final PermissionController controller = new PermissionController(permissionService, memberRepository);

    @Test
    void adminMatrixEndpointsAreMethodGuarded() throws NoSuchMethodException {
        Method get = PermissionController.class.getMethod("matrix");
        Method put = PermissionController.class.getMethod(
                "replace",
                PermissionMatrixUpdateRequest.class,
                org.springframework.security.core.Authentication.class
        );

        assertThat(get.getAnnotation(PreAuthorize.class).value()).isEqualTo("hasRole('ADMIN')");
        assertThat(put.getAnnotation(PreAuthorize.class).value()).isEqualTo("hasRole('ADMIN')");
    }

    @Test
    void myPermissionsReturnsRoleAndDottedKeysForAuthenticatedMember() {
        Member member = member(Member.Role.ADMIN);
        when(memberRepository.findByStudentId("2026000001")).thenReturn(Optional.of(member));
        when(permissionService.effective(member)).thenReturn(Set.of(Permission.CLUB_ROOM_VIEW, Permission.NOTICE_WRITE));

        var response = controller.me(new TestingAuthenticationToken("2026000001", "password")).getBody();

        assertThat(response.role()).isEqualTo("ADMIN");
        assertThat(response.permissions()).containsExactly("club_room.view", "notice.write");
    }

    @Test
    void replaceRejectsAdminUnknownMissingAndMalformedMatrixPayloads() {
        assertBadRequest(new PermissionMatrixUpdateRequest(Map.of(
                "ASSOCIATE", List.of(),
                "USER", List.of(),
                "OFFICER", List.of(),
                "VICE_PRESIDENT", List.of(),
                "ADMIN", List.of("club_room.view")
        )));
        assertBadRequest(new PermissionMatrixUpdateRequest(Map.of(
                "ASSOCIATE", List.of(),
                "USER", List.of(),
                "OFFICER", List.of(),
                "GUEST", List.of()
        )));
        assertBadRequest(new PermissionMatrixUpdateRequest(Map.of(
                "ASSOCIATE", List.of(),
                "USER", List.of(),
                "OFFICER", List.of()
        )));
        assertBadRequest(new PermissionMatrixUpdateRequest(Map.of(
                "ASSOCIATE", List.of(),
                "USER", List.of("members.manage"),
                "OFFICER", List.of(),
                "VICE_PRESIDENT", List.of()
        )));
        assertBadRequest(new PermissionMatrixUpdateRequest(null));
    }

    @Test
    void replaceAcceptsExactlyFourEditableRolesAndReturnsRefreshedMatrix() {
        PermissionMatrixUpdateRequest request = new PermissionMatrixUpdateRequest(Map.of(
                "ASSOCIATE", List.of(),
                "USER", List.of("club_room.view"),
                "OFFICER", List.of("notice.write"),
                "VICE_PRESIDENT", List.of("archive.manage")
        ));
        PermissionMatrixResponse refreshed = new PermissionMatrixResponse(
                List.of("ASSOCIATE", "USER", "OFFICER", "VICE_PRESIDENT"),
                List.of(),
                Map.of("USER", List.of("club_room.view")),
                LocalDateTime.of(2026, 9, 4, 12, 0),
                "2026000001"
        );
        when(permissionService.replace(eq(Map.of(
                Member.Role.ASSOCIATE, Set.of(),
                Member.Role.USER, Set.of(Permission.CLUB_ROOM_VIEW),
                Member.Role.OFFICER, Set.of(Permission.NOTICE_WRITE),
                Member.Role.VICE_PRESIDENT, Set.of(Permission.ARCHIVE_MANAGE)
        )), eq("2026000001"))).thenReturn(refreshed);

        var response = controller.replace(request, new TestingAuthenticationToken("2026000001", "password")).getBody();

        assertThat(response).isEqualTo(refreshed);
        verify(permissionService).replace(eq(Map.of(
                Member.Role.ASSOCIATE, Set.of(),
                Member.Role.USER, Set.of(Permission.CLUB_ROOM_VIEW),
                Member.Role.OFFICER, Set.of(Permission.NOTICE_WRITE),
                Member.Role.VICE_PRESIDENT, Set.of(Permission.ARCHIVE_MANAGE)
        )), eq("2026000001"));
    }

    private void assertBadRequest(PermissionMatrixUpdateRequest request) {
        assertThatThrownBy(() -> controller.replace(request, new TestingAuthenticationToken("2026000001", "password")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode().value())
                .isEqualTo(400);
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
}
