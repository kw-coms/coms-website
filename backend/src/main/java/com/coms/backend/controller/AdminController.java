package com.coms.backend.controller;

import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.EligibleMemberImportResponse;
import com.coms.backend.dto.RoleUpdateRequest;
import com.coms.backend.service.AdminService;
import com.coms.backend.service.EligibleMemberService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;
    private final EligibleMemberService eligibleMemberService;

    public AdminController(AdminService adminService, EligibleMemberService eligibleMemberService) {
        this.adminService = adminService;
        this.eligibleMemberService = eligibleMemberService;
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

    @PostMapping("/eligible-members/import")
    public ResponseEntity<EligibleMemberImportResponse> importEligibleMembers(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(eligibleMemberService.importRoster(file));
    }
}
