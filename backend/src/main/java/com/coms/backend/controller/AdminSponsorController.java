package com.coms.backend.controller;

import com.coms.backend.domain.SponsorImage;
import com.coms.backend.dto.SponsorAdminResponse;
import com.coms.backend.dto.SponsorImageResponse;
import com.coms.backend.dto.SponsorPageSettings;
import com.coms.backend.dto.SponsorReorderRequest;
import com.coms.backend.dto.SponsorRequest;
import com.coms.backend.dto.SponsorTierRequest;
import com.coms.backend.dto.SponsorTierResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.SponsorService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 회장(ADMIN) 전용 후원자 관리.
 *
 * <p>The path already sits inside the {@code /api/admin/**} → {@code hasRole("ADMIN")} boundary
 * in SecurityConfig (only {@code /api/admin/community/**} and the named 임원 routes are carved out
 * above it); the class-level {@code @PreAuthorize} is the second, method-level lock so a future
 * matcher edit cannot silently widen this surface.
 */
@RestController
@RequestMapping("/api/admin/sponsors")
@PreAuthorize("hasRole('ADMIN')")
public class AdminSponsorController {

    private final SponsorService sponsorService;
    private final AuditLogService auditLogService;

    public AdminSponsorController(SponsorService sponsorService, AuditLogService auditLogService) {
        this.sponsorService = sponsorService;
        this.auditLogService = auditLogService;
    }

    // ---- Sponsors ------------------------------------------------------------------------

    @GetMapping
    public ResponseEntity<List<SponsorAdminResponse>> list() {
        return ResponseEntity.ok(sponsorService.adminList());
    }

    @PostMapping
    public ResponseEntity<SponsorAdminResponse> create(@Valid @RequestBody SponsorRequest request,
                                                       Authentication authentication) {
        SponsorAdminResponse created = sponsorService.create(request);
        audit(authentication, "ADMIN_SPONSOR_CREATE", "SPONSOR", created.id(), "name=" + created.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<SponsorAdminResponse> update(@PathVariable Long id,
                                                       @Valid @RequestBody SponsorRequest request,
                                                       Authentication authentication) {
        SponsorAdminResponse updated = sponsorService.update(id, request);
        audit(authentication, "ADMIN_SPONSOR_UPDATE", "SPONSOR", updated.id(),
                "name=" + updated.name() + "\nvisible=" + updated.visible());
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication authentication) {
        SponsorAdminResponse existing = sponsorService.get(id);
        sponsorService.delete(id);
        audit(authentication, "ADMIN_SPONSOR_DELETE", "SPONSOR", id, "name=" + existing.name());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/reorder")
    public ResponseEntity<List<SponsorAdminResponse>> reorder(@Valid @RequestBody SponsorReorderRequest request,
                                                              Authentication authentication) {
        sponsorService.reorder(request.ids());
        audit(authentication, "ADMIN_SPONSOR_REORDER", "SPONSOR", null, "count=" + request.ids().size());
        return ResponseEntity.ok(sponsorService.adminList());
    }

    // ---- Tiers ---------------------------------------------------------------------------

    @GetMapping("/tiers")
    public ResponseEntity<List<SponsorTierResponse>> tiers() {
        return ResponseEntity.ok(sponsorService.adminTiers());
    }

    @PostMapping("/tiers")
    public ResponseEntity<SponsorTierResponse> createTier(@Valid @RequestBody SponsorTierRequest request,
                                                          Authentication authentication) {
        SponsorTierResponse created = sponsorService.createTier(request);
        audit(authentication, "ADMIN_SPONSOR_TIER_CREATE", "SPONSOR_TIER", created.id(), "name=" + created.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PatchMapping("/tiers/{id}")
    public ResponseEntity<SponsorTierResponse> updateTier(@PathVariable Long id,
                                                          @Valid @RequestBody SponsorTierRequest request,
                                                          Authentication authentication) {
        SponsorTierResponse updated = sponsorService.updateTier(id, request);
        audit(authentication, "ADMIN_SPONSOR_TIER_UPDATE", "SPONSOR_TIER", id, "name=" + updated.name());
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/tiers/{id}")
    public ResponseEntity<Void> deleteTier(@PathVariable Long id, Authentication authentication) {
        SponsorTierResponse existing = sponsorService.getTier(id);
        sponsorService.deleteTier(id);
        audit(authentication, "ADMIN_SPONSOR_TIER_DELETE", "SPONSOR_TIER", id, "name=" + existing.name());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/tiers/reorder")
    public ResponseEntity<List<SponsorTierResponse>> reorderTiers(@Valid @RequestBody SponsorReorderRequest request,
                                                                  Authentication authentication) {
        sponsorService.reorderTiers(request.ids());
        audit(authentication, "ADMIN_SPONSOR_TIER_REORDER", "SPONSOR_TIER", null, "count=" + request.ids().size());
        return ResponseEntity.ok(sponsorService.adminTiers());
    }

    // ---- Page settings -------------------------------------------------------------------

    @GetMapping("/page")
    public ResponseEntity<SponsorPageSettings> pageSettings() {
        return ResponseEntity.ok(sponsorService.adminSettings());
    }

    @PutMapping("/page")
    @io.swagger.v3.oas.annotations.parameters.RequestBody(
            content = @io.swagger.v3.oas.annotations.media.Content(
                    schema = @io.swagger.v3.oas.annotations.media.Schema(implementation = SponsorPageSettings.class)))
    public ResponseEntity<SponsorPageSettings> savePageSettings(@RequestBody java.util.Map<String, Object> request,
                                                                Authentication authentication) {
        SponsorPageSettings saved = sponsorService.saveSettings(request);
        audit(authentication, "ADMIN_SPONSOR_PAGE_UPDATE", "SPONSOR_PAGE", null,
                "layout=" + saved.layout() + "\naccentColor=" + saved.accentColor());
        return ResponseEntity.ok(saved);
    }

    // ---- Images --------------------------------------------------------------------------

    /**
     * Admin counterpart to {@code SponsorController#image} — no visibility gate, so hidden,
     * anonymous, and expired sponsors' logos (and any freshly uploaded, not-yet-attached image)
     * still preview correctly in the admin UI. Reuses {@code SponsorService}'s same sniffed-mime
     * loader; only the cache policy differs since this response can vary per viewer's permissions.
     */
    @GetMapping("/images/{id}")
    public ResponseEntity<Resource> image(@PathVariable Long id) {
        SponsorImage meta = sponsorService.imageMeta(id);
        Resource resource = sponsorService.loadImage(meta);
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank()
                ? "sponsor-image"
                : meta.getOriginalName();
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .contentType(MediaType.parseMediaType(meta.getMime()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @PostMapping("/images")
    public ResponseEntity<SponsorImageResponse> uploadImage(@RequestPart("image") MultipartFile image,
                                                            Authentication authentication) {
        SponsorImageResponse uploaded = sponsorService.uploadImage(image);
        audit(authentication, "ADMIN_SPONSOR_IMAGE_UPLOAD", "SPONSOR_IMAGE", uploaded.id(), null);
        return ResponseEntity.status(HttpStatus.CREATED).body(uploaded);
    }

    @DeleteMapping("/images/{id}")
    public ResponseEntity<Void> deleteImage(@PathVariable Long id, Authentication authentication) {
        sponsorService.deleteImage(id);
        audit(authentication, "ADMIN_SPONSOR_IMAGE_DELETE", "SPONSOR_IMAGE", id, null);
        return ResponseEntity.noContent().build();
    }

    // ---- Export --------------------------------------------------------------------------

    /** 회장 전용 장부 내보내기 — 금액 메모가 포함되므로 공개 경로에는 존재하지 않는다. */
    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> exportCsv(Authentication authentication) {
        byte[] body = sponsorService.exportCsv().getBytes(StandardCharsets.UTF_8);
        audit(authentication, "ADMIN_SPONSOR_EXPORT", "SPONSOR", null, "format=csv");
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sponsors.csv\"")
                .body(body);
    }

    private void audit(Authentication authentication, String action, String targetType, Long targetId, String detail) {
        auditLogService.record(
                authentication == null ? null : authentication.getName(),
                action,
                targetType,
                targetId == null ? null : String.valueOf(targetId),
                detail,
                null
        );
    }
}
