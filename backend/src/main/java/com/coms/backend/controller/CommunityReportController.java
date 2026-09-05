package com.coms.backend.controller;

import com.coms.backend.dto.CommunityPostReportRequest;
import com.coms.backend.dto.CommunityPostReportResponse;
import com.coms.backend.dto.CommunityReportResolveRequest;
import com.coms.backend.service.CommunityPostReportService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class CommunityReportController {

    private final CommunityPostReportService reportService;

    public CommunityReportController(CommunityPostReportService reportService) {
        this.reportService = reportService;
    }

    @PostMapping("/api/community/posts/{id}/reports")
    public ResponseEntity<CommunityPostReportResponse> report(@PathVariable Long id,
                                                              @Valid @RequestBody CommunityPostReportRequest request,
                                                              Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(reportService.report(id, authentication.getName(), request));
    }

    @PreAuthorize("@perm.has(authentication,'COMMUNITY_MODERATE')")
    @GetMapping("/api/admin/community/reports")
    public ResponseEntity<List<CommunityPostReportResponse>> listOpen() {
        return ResponseEntity.ok(reportService.listOpen());
    }

    @PreAuthorize("@perm.has(authentication,'COMMUNITY_MODERATE')")
    @PatchMapping("/api/admin/community/reports/{id}")
    public ResponseEntity<CommunityPostReportResponse> resolve(@PathVariable Long id,
                                                               @Valid @RequestBody CommunityReportResolveRequest request,
                                                               Authentication authentication) {
        return ResponseEntity.ok(reportService.resolve(id, authentication.getName(), request.action(), request.note()));
    }
}
