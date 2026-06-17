package com.coms.backend.controller;

import com.coms.backend.service.AdminService;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.BannedStudentService;
import com.coms.backend.service.CacheMaintenanceService;
import com.coms.backend.service.CommunityDeletionArchiveService;
import com.coms.backend.service.EligibleMemberService;
import com.coms.backend.service.RecruitApplicationService;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminControllerAuditLogTest {

    private final AdminService adminService = mock(AdminService.class);
    private final EligibleMemberService eligibleMemberService = mock(EligibleMemberService.class);
    private final BannedStudentService bannedStudentService = mock(BannedStudentService.class);
    private final AuditLogService auditLogService = mock(AuditLogService.class);
    private final CacheMaintenanceService cacheMaintenanceService = mock(CacheMaintenanceService.class);
    private final RecruitApplicationService recruitApplicationService = mock(RecruitApplicationService.class);
    private final CommunityDeletionArchiveService communityDeletionArchiveService = mock(CommunityDeletionArchiveService.class);
    private final AdminController controller = new AdminController(
            adminService,
            eligibleMemberService,
            bannedStudentService,
            auditLogService,
            cacheMaintenanceService,
            recruitApplicationService,
            communityDeletionArchiveService
    );

    @Test
    void memberDeletionAuditLogIncludesDeletedTargetSnapshot() {
        when(adminService.deleteMember(7L)).thenReturn(new AdminService.DeletedMemberSnapshot(
                7L,
                "2025123456",
                "삭제대상",
                "USER",
                "target@example.com"
        ));

        controller.deleteMember(new TestingAuthenticationToken("2026000001", "password"), 7L);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_MEMBER_DELETE"),
                eq("MEMBER"),
                eq("7"),
                argThat(detail -> {
                    assertThat(detail).contains(
                            "studentId=2025123456",
                            "name=삭제대상",
                            "role=USER",
                            "email=target@example.com"
                    );
                    return true;
                }),
                isNull()
        );
    }

    @Test
    void eligibleMemberDeletionAuditLogIncludesRosterSnapshot() {
        when(eligibleMemberService.deleteEligibleMember(9L)).thenReturn(new EligibleMemberService.DeletedEligibleMemberSnapshot(
                9L,
                "2025123456",
                "명부대상",
                "59",
                "010-1234-5678"
        ));

        controller.deleteEligibleMember(new TestingAuthenticationToken("2026000001", "password"), 9L);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_ELIGIBLE_MEMBER_DELETE"),
                eq("ELIGIBLE_MEMBER"),
                eq("9"),
                argThat(detail -> {
                    assertThat(detail).contains(
                            "studentId=2025123456",
                            "name=명부대상",
                            "generation=59",
                            "phone=010-1234-5678"
                    );
                    return true;
                }),
                isNull()
        );
    }
}
