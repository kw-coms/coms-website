package com.coms.backend.controller;

import com.coms.backend.dto.HackathonReviewResponse;
import com.coms.backend.dto.HackathonScoresRequest;
import com.coms.backend.dto.HackathonSettingsRequest;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import com.coms.backend.service.HackathonService;
import com.coms.backend.service.AuditLogService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/hackathon")
public class AdminHackathonController {
    private final HackathonService service;
    private final AuditLogService auditLogService;

    public AdminHackathonController(HackathonService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/reviews")
    public List<HackathonReviewResponse> reviews() { return service.list(); }

    @DeleteMapping("/reviews/{id}")
    @ApiResponse(responseCode = "204", description = "평가 삭제")
    public ResponseEntity<Void> deleteReview(@PathVariable Long id, Authentication authentication) {
        service.deleteReview(id);
        auditLogService.record(authentication.getName(), "ADMIN_HACKATHON_REVIEW_DELETE",
                "HACKATHON_REVIEW", String.valueOf(id), null, null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/settings")
    public Map<String, Boolean> settings() { return Map.of("open", service.isOpen()); }

    @PutMapping("/settings")
    public Map<String, Boolean> settings(@RequestBody HackathonSettingsRequest request) {
        return Map.of("open", service.setOpen(request == null ? null : request.open()));
    }

    @PutMapping("/chair-reviews/{projectId}")
    public HackathonReviewResponse chair(@PathVariable String projectId, @RequestBody HackathonScoresRequest request) {
        return service.saveChair(projectId, request);
    }
}
