package com.coms.backend.controller;

import com.coms.backend.dto.SiteSettingsRequest;
import com.coms.backend.dto.SiteSettingsResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.SiteSettingsService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class SiteSettingsController {
    private final SiteSettingsService siteSettingsService;
    private final AuditLogService auditLogService;

    public SiteSettingsController(SiteSettingsService siteSettingsService, AuditLogService auditLogService) {
        this.siteSettingsService = siteSettingsService;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/site-settings")
    public ResponseEntity<SiteSettingsResponse> current() {
        return ResponseEntity.ok(siteSettingsService.current());
    }

    @GetMapping("/admin/site-settings")
    @PreAuthorize("hasAnyRole('OFFICER','ADMIN')")
    public ResponseEntity<SiteSettingsResponse> adminCurrent() {
        return ResponseEntity.ok(siteSettingsService.current());
    }

    @PutMapping("/admin/site-settings")
    @PreAuthorize("hasAnyRole('OFFICER','ADMIN')")
    public ResponseEntity<SiteSettingsResponse> publish(@Valid @RequestBody SiteSettingsRequest request,
                                                        Authentication authentication) {
        SiteSettingsResponse response = siteSettingsService.publish(request);
        auditLogService.record(
                authentication == null ? null : authentication.getName(),
                "ADMIN_SITE_SETTINGS_PUBLISH",
                "SITE_SETTINGS",
                String.valueOf(response.id()),
                "semesterLabel=" + response.semesterLabel() + "\nrecruitmentStatus=" + response.recruitmentStatus(),
                null
        );
        return ResponseEntity.ok(response);
    }
}
