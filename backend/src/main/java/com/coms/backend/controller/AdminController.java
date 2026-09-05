package com.coms.backend.controller;

import com.coms.backend.domain.DeletedCommunityPostImage;
import com.coms.backend.domain.DeletedCommunityPostMedia;
import com.coms.backend.dto.AddEligibleMemberRequest;
import com.coms.backend.dto.AdminAnalyticsResponse;
import com.coms.backend.dto.AuditLogResponse;
import com.coms.backend.dto.BanStudentRequest;
import com.coms.backend.dto.BannedStudentResponse;
import com.coms.backend.dto.CacheClearResponse;
import com.coms.backend.dto.DeletedCommunityPostResponse;
import com.coms.backend.dto.DeletedCommunityPostRestoreResponse;
import com.coms.backend.dto.ResetPasswordRequest;
import com.coms.backend.dto.EligibleMemberImportResponse;
import com.coms.backend.dto.EligibleMemberResponse;
import com.coms.backend.dto.LoginAuditResponse;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.RecruitApplicationAdminResponse;
import com.coms.backend.dto.RecruitApplicationStatusUpdateRequest;
import com.coms.backend.dto.RoleUpdateRequest;
import com.coms.backend.dto.UpdateEligibleMemberRequest;
import com.coms.backend.service.AdminAnalyticsService;
import com.coms.backend.service.AdminService;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.BannedStudentService;
import com.coms.backend.service.CacheMaintenanceService;
import com.coms.backend.service.CommunityDeletionArchiveService;
import com.coms.backend.service.EligibleMemberService;
import com.coms.backend.service.RecruitApplicationService;
import com.coms.backend.web.ListPagination;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;

@PreAuthorize("hasRole('ADMIN')")
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;
    private final AdminAnalyticsService adminAnalyticsService;
    private final EligibleMemberService eligibleMemberService;
    private final BannedStudentService bannedStudentService;
    private final AuditLogService auditLogService;
    private final CacheMaintenanceService cacheMaintenanceService;
    private final RecruitApplicationService recruitApplicationService;
    private final CommunityDeletionArchiveService communityDeletionArchiveService;

    public AdminController(AdminService adminService, AdminAnalyticsService adminAnalyticsService,
                           EligibleMemberService eligibleMemberService,
                           BannedStudentService bannedStudentService, AuditLogService auditLogService,
                           CacheMaintenanceService cacheMaintenanceService,
                           RecruitApplicationService recruitApplicationService,
                           CommunityDeletionArchiveService communityDeletionArchiveService) {
        this.adminService = adminService;
        this.adminAnalyticsService = adminAnalyticsService;
        this.eligibleMemberService = eligibleMemberService;
        this.bannedStudentService = bannedStudentService;
        this.auditLogService = auditLogService;
        this.cacheMaintenanceService = cacheMaintenanceService;
        this.recruitApplicationService = recruitApplicationService;
        this.communityDeletionArchiveService = communityDeletionArchiveService;
    }

    @GetMapping("/analytics")
    public ResponseEntity<AdminAnalyticsResponse> analytics() {
        return ResponseEntity.ok(adminAnalyticsService.buildAnalytics());
    }

    @GetMapping("/members")
    public ResponseEntity<List<MemberResponse>> members(@RequestParam(required = false) Integer page,
                                                        @RequestParam(required = false) Integer size) {
        return ListPagination.paginate(adminService.listMembers(), page, size);
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

    @PatchMapping("/members/{id}/generation")
    public ResponseEntity<MemberResponse> updateGeneration(Authentication authentication,
                                                           @PathVariable Long id,
                                                           @Valid @RequestBody com.coms.backend.dto.GenerationUpdateRequest request) {
        MemberResponse response = adminService.updateGeneration(id, request.generation());
        auditLogService.record(authentication.getName(), "ADMIN_MEMBER_GENERATION_UPDATE", "MEMBER", String.valueOf(id),
                "targetStudentId=" + response.studentId() + ", generation=" + response.generation(), null);
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
            eligibleMemberService.addSingle(request.studentId(), request.name(), request.generation(), request.phone());
        } else if (request.admissionYear() != null && !request.admissionYear().isBlank()) {
            eligibleMemberService.addGraduateSingle(request.name(), request.admissionYear(), request.generation(), request.phone());
        } else {
            // 학번 미상 재학생: 이름+기수(+전화)만으로 임시 등록. 학번은 나중에 편집으로 채운다.
            eligibleMemberService.addPendingByGeneration(request.name(), request.generation(), request.phone());
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
        eligibleMemberService.updateEligibleMember(id, request.studentId(), request.name(), request.generation(), request.phone());
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
    public ResponseEntity<List<RecruitApplicationAdminResponse>> recruitApplications(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return ListPagination.paginate(recruitApplicationService.listApplications(), page, size);
    }

    @PatchMapping("/recruit-applications/{id}/status")
    public ResponseEntity<RecruitApplicationAdminResponse> updateRecruitApplicationStatus(
            Authentication authentication,
            @PathVariable Long id,
            @Valid @RequestBody RecruitApplicationStatusUpdateRequest request) {
        RecruitApplicationAdminResponse response = recruitApplicationService.updateStatus(id, request, authentication.getName());
        auditLogService.record(authentication.getName(), "ADMIN_RECRUIT_APPLICATION_STATUS_UPDATE", "RECRUIT_APPLICATION",
                String.valueOf(id), "status=" + response.status(), null);
        return ResponseEntity.ok(response);
    }

    /** 최근 100건의 지원 처리 이력(합격/불합격) — 지원서는 처리 시 삭제되므로 이 로그가 원본 기록. */
    @GetMapping("/recruit-promotions")
    public ResponseEntity<List<com.coms.backend.dto.RecruitPromotionLogResponse>> recruitPromotions() {
        return ResponseEntity.ok(recruitApplicationService.listPromotions());
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<List<AuditLogResponse>> auditLogs(@RequestParam(defaultValue = "1000") int limit) {
        return ResponseEntity.ok(auditLogService.recent(limit));
    }

    @PreAuthorize("@perm.has(authentication,'COMMUNITY_MODERATE')")
    @GetMapping("/community/deleted-posts")
    public ResponseEntity<List<DeletedCommunityPostResponse>> deletedCommunityPosts(@RequestParam(defaultValue = "300") int limit) {
        return ResponseEntity.ok(communityDeletionArchiveService.recent(limit));
    }

    @PreAuthorize("@perm.has(authentication,'COMMUNITY_MODERATE')")
    @GetMapping("/community/deleted-posts/{id}")
    public ResponseEntity<DeletedCommunityPostResponse> deletedCommunityPost(@PathVariable Long id) {
        return ResponseEntity.ok(communityDeletionArchiveService.detail(id));
    }

    @PreAuthorize("@perm.has(authentication,'COMMUNITY_MODERATE')")
    @GetMapping("/community/deleted-posts/{id}/images/{imageId}")
    public ResponseEntity<Resource> deletedCommunityPostImage(@PathVariable Long id, @PathVariable Long imageId) {
        DeletedCommunityPostImage meta = communityDeletionArchiveService.loadImageMeta(id, imageId);
        Resource resource = communityDeletionArchiveService.loadImage(id, imageId);
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank() ? "deleted-community-image" : meta.getOriginalName();
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @PreAuthorize("@perm.has(authentication,'COMMUNITY_MODERATE')")
    @GetMapping("/community/deleted-posts/{id}/media/{mediaId}")
    public ResponseEntity<Resource> deletedCommunityPostMedia(@PathVariable Long id, @PathVariable Long mediaId) {
        DeletedCommunityPostMedia meta = communityDeletionArchiveService.loadMediaMeta(id, mediaId);
        Resource resource = communityDeletionArchiveService.loadMedia(id, mediaId);
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank() ? "deleted-community-media" : meta.getOriginalName();
        ContentDisposition disposition = DeletedCommunityPostMedia.KIND_FILE.equals(meta.getKind())
                ? ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build()
                : ContentDisposition.inline().filename(filename, StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    @PreAuthorize("@perm.has(authentication,'COMMUNITY_MODERATE')")
    @PostMapping("/community/deleted-posts/{id}/restore")
    public ResponseEntity<DeletedCommunityPostRestoreResponse> restoreDeletedCommunityPost(Authentication authentication,
                                                                                          @PathVariable Long id) {
        return ResponseEntity.ok(communityDeletionArchiveService.restore(id, authentication.getName()));
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

    private MediaType mediaType(String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
