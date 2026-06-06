package com.coms.backend.controller;

import com.coms.backend.dto.AddEligibleMemberRequest;
import com.coms.backend.dto.BanStudentRequest;
import com.coms.backend.dto.BannedStudentResponse;
import com.coms.backend.dto.ResetPasswordRequest;
import com.coms.backend.dto.EligibleMemberImportResponse;
import com.coms.backend.dto.EligibleMemberResponse;
import com.coms.backend.dto.LoginAuditResponse;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.RoleUpdateRequest;
import com.coms.backend.dto.UpdateEligibleMemberRequest;
import com.coms.backend.service.AdminService;
import com.coms.backend.service.BannedStudentService;
import com.coms.backend.service.EligibleMemberService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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

    public AdminController(AdminService adminService, EligibleMemberService eligibleMemberService,
                           BannedStudentService bannedStudentService) {
        this.adminService = adminService;
        this.eligibleMemberService = eligibleMemberService;
        this.bannedStudentService = bannedStudentService;
    }

    @GetMapping("/members")
    public ResponseEntity<List<MemberResponse>> members() {
        return ResponseEntity.ok(adminService.listMembers());
    }

    @PatchMapping("/members/{id}/role")
    public ResponseEntity<MemberResponse> updateRole(@PathVariable Long id,
                                                     @Valid @RequestBody RoleUpdateRequest request) {
        return ResponseEntity.ok(adminService.updateRole(id, request));
    }

    @DeleteMapping("/members/{id}")
    public ResponseEntity<Void> deleteMember(@PathVariable Long id) {
        adminService.deleteMember(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/eligible-members")
    public ResponseEntity<Void> addEligibleMember(@Valid @RequestBody AddEligibleMemberRequest request) {
        eligibleMemberService.addSingle(request.studentId(), request.name());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/eligible-members")
    public ResponseEntity<List<EligibleMemberResponse>> eligibleMembers() {
        return ResponseEntity.ok(eligibleMemberService.listRoster());
    }

    @PatchMapping("/eligible-members/{id}")
    public ResponseEntity<Void> updateEligibleMember(@PathVariable Long id,
                                                     @Valid @RequestBody UpdateEligibleMemberRequest request) {
        eligibleMemberService.updateEligibleMember(id, request.studentId(), request.name(), request.phone());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/eligible-members/{id}")
    public ResponseEntity<Void> deleteEligibleMember(@PathVariable Long id) {
        eligibleMemberService.deleteEligibleMember(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/eligible-members/import")
    public ResponseEntity<EligibleMemberImportResponse> importEligibleMembers(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(eligibleMemberService.importRoster(file));
    }

    @PutMapping("/members/{id}/password")
    public ResponseEntity<Void> resetMemberPassword(@PathVariable Long id,
                                                    @Valid @RequestBody ResetPasswordRequest request) {
        adminService.resetPassword(id, request.password());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/banned-students")
    public ResponseEntity<List<BannedStudentResponse>> listBanned() {
        return ResponseEntity.ok(bannedStudentService.listBanned());
    }

    @PostMapping("/banned-students")
    public ResponseEntity<Void> banStudent(@Valid @RequestBody BanStudentRequest request) {
        bannedStudentService.ban(request.studentId(), request.duration());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/banned-students/{studentId}")
    public ResponseEntity<Void> unbanStudent(@PathVariable String studentId) {
        bannedStudentService.unban(studentId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/login-audit")
    public ResponseEntity<List<LoginAuditResponse>> loginAudit() {
        return ResponseEntity.ok(adminService.listLoginAudit());
    }
}
