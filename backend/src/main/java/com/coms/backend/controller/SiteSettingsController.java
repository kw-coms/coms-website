package com.coms.backend.controller;

import com.coms.backend.dto.ClubRoomResponse;
import com.coms.backend.dto.ClubRoomUpdateRequest;
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

    // club_room.view 권한 — 기본값은 회원(USER) 이상이고, 회장이 권한 매트릭스에서 조정한다.
    @GetMapping("/club-room")
    @PreAuthorize("@perm.has(authentication,'CLUB_ROOM_VIEW')")
    public ResponseEntity<ClubRoomResponse> clubRoom() {
        return ResponseEntity.ok(new ClubRoomResponse(siteSettingsService.clubRoomCode()));
    }

    @PutMapping("/admin/club-room")
    @PreAuthorize("@perm.has(authentication,'SITE_SETTINGS_EDIT')")
    public ResponseEntity<ClubRoomResponse> updateClubRoom(@Valid @RequestBody ClubRoomUpdateRequest request,
                                                           Authentication authentication) {
        String saved = siteSettingsService.updateClubRoomCode(request.doorCode());
        // The code itself never goes into the audit log.
        auditLogService.record(
                authentication == null ? null : authentication.getName(),
                "ADMIN_CLUB_ROOM_CODE_UPDATE",
                "SITE_SETTINGS",
                "1",
                "clubRoomCode=(updated)",
                null
        );
        return ResponseEntity.ok(new ClubRoomResponse(saved));
    }

    @GetMapping("/admin/site-settings")
    @PreAuthorize("@perm.has(authentication,'SITE_SETTINGS_EDIT')")
    public ResponseEntity<SiteSettingsResponse> adminCurrent() {
        return ResponseEntity.ok(siteSettingsService.current());
    }

    @PutMapping("/admin/site-settings")
    @PreAuthorize("@perm.has(authentication,'SITE_SETTINGS_EDIT')")
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
