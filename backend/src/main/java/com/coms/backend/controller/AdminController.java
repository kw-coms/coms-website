package com.coms.backend.controller;

import com.coms.backend.dto.AddEligibleMemberRequest;
import com.coms.backend.dto.AuditLogResponse;
import com.coms.backend.dto.BanStudentRequest;
import com.coms.backend.dto.BannedStudentResponse;
import com.coms.backend.dto.CacheClearResponse;
import com.coms.backend.dto.DeletedCommunityPostResponse;
import com.coms.backend.dto.ResetPasswordRequest;
import com.coms.backend.dto.EligibleMemberImportResponse;
import com.coms.backend.dto.EligibleMemberResponse;
import com.coms.backend.dto.LoginAuditResponse;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.RecruitApplicationAdminResponse;
import com.coms.backend.dto.RecruitApplicationStatusUpdateRequest;
import com.coms.backend.dto.RoleUpdateRequest;
import com.coms.backend.dto.UpdateEligibleMemberRequest;
import com.coms.backend.service.AdminService;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.BannedStudentService;
import com.coms.backend.service.CacheMaintenanceService;
import com.coms.backend.service.CommunityDeletionArchiveService;
import com.coms.backend.service.EligibleMemberService;
import com.coms.backend.service.RecruitApplicationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@PreAuthorize("hasRole('ADMIN')")
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;
    private final EligibleMemberService eligibleMemberService;
    private final BannedStudentService bannedStudentService;
    private final AuditLogService auditLogService;
    private final CacheMaintenanceService cacheMaintenanceService;
    private final RecruitApplicationService recruitApplicationService;
    private final CommunityDeletionArchiveService communityDeletionArchiveService;

    public AdminController(AdminService adminService, EligibleMemberService eligibleMemberService,
                           BannedStudentService bannedStudentService, AuditLogService auditLogService,
                           CacheMaintenanceService cacheMaintenanceService,
                           RecruitApplicationService recruitApplicationService,
                           CommunityDeletionArchiveService communityDeletionArchiveService) {
        this.adminService = adminService;
        this.eligibleMemberService = eligibleMemberService;
        this.bannedStudentService = bannedStudentService;
        this.auditLogService = auditLogService;
        this.cacheMaintenanceService = cacheMaintenanceService;
        this.recruitApplicationService = recruitApplicationService;
        this.communityDeletionArchiveService = communityDeletionArchiveService;
    }

    @GetMapping("/members")
    public ResponseEntity<List<MemberResponse>> members() {
        return ResponseEntity.ok(adminService.listMembers());
    }

    @PatchMapping("/members/{id}/role")
    public ResponseEntity<MemberResponse> updateRole(Authentication authentication,
                                                     @PathVariable Long id,
                                                     @Valid @RequestBody RoleUpdateRequest request) {
        MemberResponse response = adminService.updateRole(id, request);
        auditLogService.record(authentication.getName(), "ADMIN_MEMBER_ROLE_UPDATE", "MEMBER", String.valueOf(id),
                "targetStudentId=" + response.studentId() + ", role=" + response.role(), null);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/members/{id}")
    public ResponseEntity<Void> deleteMember(Authentication authentication, @PathVariable Long id) {
        AdminService.DeletedMemberSnapshot deleted = adminService.deleteMember(id);
        auditLogService.record(authentication.getName(), "ADMIN_MEMBER_DELETE", "MEMBER", String.valueOf(id),
                memberDeletionDetail(deleted), null);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/eligible-members")
    public ResponseEntity<Void> addEligibleMember(Authentication authentication, @Valid @RequestBody AddEligibleMemberRequest request) {
        if (request.studentId() != null && !request.studentId().isBlank()) {
            eligibleMemberService.addSingle(request.studentId(), request.name());
        } else {
            eligibleMemberService.addGraduateSingle(request.name(), request.admissionYear(), request.generation());
        }
        auditLogService.record(authentication.getName(), "ADMIN_ELIGIBLE_MEMBER_ADD", "ELIGIBLE_MEMBER",
                request.studentId(), "name=" + request.name(), null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/eligible-members")
    public ResponseEntity<List<EligibleMemberResponse>> eligibleMembers() {
        return ResponseEntity.ok(eligibleMemberService.listRoster());
    }

    @PatchMapping("/eligible-members/{id}")
    public ResponseEntity<Void> updateEligibleMember(Authentication authentication,
                                                     @PathVariable Long id,
                                                     @Valid @RequestBody UpdateEligibleMemberRequest request) {
        eligibleMemberService.updateEligibleMember(id, request.studentId(), request.name(), request.phone());
        auditLogService.record(authentication.getName(), "ADMIN_ELIGIBLE_MEMBER_UPDATE", "ELIGIBLE_MEMBER",
                String.valueOf(id), "studentId=" + request.studentId() + ", name=" + request.name(), null);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/eligible-members/{id}")
    public ResponseEntity<Void> deleteEligibleMember(Authentication authentication, @PathVariable Long id) {
        EligibleMemberService.DeletedEligibleMemberSnapshot deleted = eligibleMemberService.deleteEligibleMember(id);
        auditLogService.record(authentication.getName(), "ADMIN_ELIGIBLE_MEMBER_DELETE", "ELIGIBLE_MEMBER", String.valueOf(id),
                eligibleMemberDeletionDetail(deleted), null);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/eligible-members/import")
    public ResponseEntity<EligibleMemberImportResponse> importEligibleMembers(Authentication authentication,
                                                                              @RequestParam("file") MultipartFile file) {
        EligibleMemberImportResponse response = eligibleMemberService.importRoster(file);
        auditLogService.record(authentication.getName(), "ADMIN_ELIGIBLE_MEMBER_IMPORT", "ELIGIBLE_MEMBER",
                null, "imported=" + response.imported() + ", skipped=" + response.skipped(), null);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/members/{id}/password")
    public ResponseEntity<Void> resetMemberPassword(Authentication authentication,
                                                    @PathVariable Long id,
                                                    @Valid @RequestBody ResetPasswordRequest request) {
        adminService.resetPassword(id, request.password());
        auditLogService.record(authentication.getName(), "ADMIN_MEMBER_PASSWORD_RESET", "MEMBER", String.valueOf(id), null, null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/banned-students")
    public ResponseEntity<List<BannedStudentResponse>> listBanned() {
        return ResponseEntity.ok(bannedStudentService.listBanned());
    }

    @PostMapping("/banned-students")
    public ResponseEntity<Void> banStudent(Authentication authentication, @Valid @RequestBody BanStudentRequest request) {
        bannedStudentService.ban(request.studentId(), request.duration());
        auditLogService.record(authentication.getName(), "ADMIN_STUDENT_BAN", "BANNED_STUDENT",
                request.studentId(), "duration=" + request.duration(), null);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/banned-students/{studentId}")
    public ResponseEntity<Void> unbanStudent(Authentication authentication, @PathVariable String studentId) {
        bannedStudentService.unban(studentId);
        auditLogService.record(authentication.getName(), "ADMIN_STUDENT_UNBAN", "BANNED_STUDENT", studentId, null, null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/login-audit")
    public ResponseEntity<List<LoginAuditResponse>> loginAudit() {
        return ResponseEntity.ok(adminService.listLoginAudit());
    }

    @GetMapping("/recruit-applications")
    public ResponseEntity<List<RecruitApplicationAdminResponse>> recruitApplications() {
        return ResponseEntity.ok(recruitApplicationService.listApplications());
    }

    @PatchMapping("/recruit-applications/{id}/status")
    public ResponseEntity<RecruitApplicationAdminResponse> updateRecruitApplicationStatus(
            Authentication authentication,
            @PathVariable Long id,
            @Valid @RequestBody RecruitApplicationStatusUpdateRequest request) {
        RecruitApplicationAdminResponse response = recruitApplicationService.updateStatus(id, request);
        auditLogService.record(authentication.getName(), "ADMIN_RECRUIT_APPLICATION_STATUS_UPDATE", "RECRUIT_APPLICATION",
                String.valueOf(id), "status=" + response.status(), null);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<List<AuditLogResponse>> auditLogs(@RequestParam(defaultValue = "1000") int limit) {
        return ResponseEntity.ok(auditLogService.recent(limit));
    }

    @GetMapping("/community/deleted-posts")
    public ResponseEntity<List<DeletedCommunityPostResponse>> deletedCommunityPosts(@RequestParam(defaultValue = "300") int limit) {
        return ResponseEntity.ok(communityDeletionArchiveService.recent(limit));
    }

    @PostMapping("/cache/clear")
    public ResponseEntity<CacheClearResponse> clearCache(Authentication authentication) {
        CacheClearResponse response = cacheMaintenanceService.clearAll();
        auditLogService.record(authentication.getName(), "ADMIN_CACHE_CLEAR", "CACHE", null,
                "clearedCount=" + response.clearedCount() + ", clearedCaches=" + String.join(",", response.clearedCaches()), null);
        return ResponseEntity.ok(response);
    }

    private String memberDeletionDetail(AdminService.DeletedMemberSnapshot member) {
        return String.join("\n",
                "studentId=" + auditValue(member.studentId()),
                "name=" + auditValue(member.name()),
                "role=" + auditValue(member.role()),
                "email=" + auditValue(member.email())
        );
    }

    private String eligibleMemberDeletionDetail(EligibleMemberService.DeletedEligibleMemberSnapshot member) {
        return String.join("\n",
                "studentId=" + auditValue(member.studentId()),
                "name=" + auditValue(member.name()),
                "generation=" + auditValue(member.generation()),
                "phone=" + auditValue(member.phone())
        );
    }

    private String auditValue(String value) {
        String normalized = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        return normalized.isEmpty() ? "-" : normalized;
    }
}
