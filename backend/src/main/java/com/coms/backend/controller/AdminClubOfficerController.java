package com.coms.backend.controller;

import com.coms.backend.dto.ClubOfficerDto.*;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubOfficerService;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 역대 회장단 관리(회장). /api/admin/** ADMIN 경계 안에 있다. */
@RestController
@RequestMapping("/api/admin/club-officers")
public class AdminClubOfficerController {
    private final ClubOfficerService service;
    private final AuditLogService auditLogService;

    public AdminClubOfficerController(ClubOfficerService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<AdminTermView> list() {
        return service.adminList();
    }

    @PostMapping("/terms")
    public ResponseEntity<AdminTermView> createTerm(@RequestBody TermWrite request, Authentication authentication) {
        AdminTermView created = service.createTerm(request);
        audit(authentication, "ADMIN_CLUB_OFFICER_TERM_CREATE", "CLUB_OFFICER_TERM", created.id());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/terms/{termId}")
    public AdminTermView updateTerm(@PathVariable Long termId, @RequestBody TermWrite request, Authentication authentication) {
        AdminTermView updated = service.updateTerm(termId, request);
        audit(authentication, "ADMIN_CLUB_OFFICER_TERM_UPDATE", "CLUB_OFFICER_TERM", termId);
        return updated;
    }

    @DeleteMapping("/terms/{termId}")
    @ApiResponse(responseCode = "204", description = "임기 삭제(임원 포함)")
    public ResponseEntity<Void> deleteTerm(@PathVariable Long termId, Authentication authentication) {
        service.deleteTerm(termId);
        audit(authentication, "ADMIN_CLUB_OFFICER_TERM_DELETE", "CLUB_OFFICER_TERM", termId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/terms/{termId}/officers")
    public ResponseEntity<AdminTermView> addOfficer(@PathVariable Long termId, @RequestBody OfficerWrite request,
                                                    Authentication authentication) {
        AdminTermView updated = service.addOfficer(termId, request);
        audit(authentication, "ADMIN_CLUB_OFFICER_CREATE", "CLUB_OFFICER_TERM", termId);
        return ResponseEntity.status(HttpStatus.CREATED).body(updated);
    }

    @PutMapping("/terms/{termId}/officers/order")
    public AdminTermView reorderOfficers(@PathVariable Long termId, @RequestBody OrderWrite request,
                                         Authentication authentication) {
        AdminTermView updated = service.reorderOfficers(termId, request);
        audit(authentication, "ADMIN_CLUB_OFFICER_REORDER", "CLUB_OFFICER_TERM", termId);
        return updated;
    }

    @PutMapping("/officers/{officerId}")
    public AdminTermView updateOfficer(@PathVariable Long officerId, @RequestBody OfficerWrite request,
                                       Authentication authentication) {
        AdminTermView updated = service.updateOfficer(officerId, request);
        audit(authentication, "ADMIN_CLUB_OFFICER_UPDATE", "CLUB_OFFICER", officerId);
        return updated;
    }

    @DeleteMapping("/officers/{officerId}")
    public AdminTermView deleteOfficer(@PathVariable Long officerId, Authentication authentication) {
        AdminTermView updated = service.deleteOfficer(officerId);
        audit(authentication, "ADMIN_CLUB_OFFICER_DELETE", "CLUB_OFFICER", officerId);
        return updated;
    }

    /** eligibleMemberId 를 null 로 보내면 명부 연결을 푼다. */
    @PutMapping("/officers/{officerId}/link")
    public AdminTermView link(@PathVariable Long officerId, @RequestBody LinkWrite request, Authentication authentication) {
        AdminTermView updated = service.linkOfficer(officerId, request);
        audit(authentication, "ADMIN_CLUB_OFFICER_LINK", "CLUB_OFFICER", officerId);
        return updated;
    }

    /** 임기 이름(label) 기준으로 만들거나 고친다(여러 번 보내도 같은 결과). */
    @PostMapping("/import")
    public ImportResult importRows(@RequestBody ImportRequest request, Authentication authentication) {
        ImportResult result = service.importRows(request);
        audit(authentication, "ADMIN_CLUB_OFFICER_IMPORT", "CLUB_OFFICER_TERM",
                result.created() + "/" + result.updated() + "/" + result.unchanged());
        return result;
    }

    private void audit(Authentication authentication, String action, String target, Object id) {
        auditLogService.record(authentication.getName(), action, target, String.valueOf(id), null, null);
    }
}
