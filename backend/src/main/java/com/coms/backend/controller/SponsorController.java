package com.coms.backend.controller;

import com.coms.backend.domain.SponsorImage;
import com.coms.backend.dto.SponsorPageResponse;
import com.coms.backend.dto.SponsorTierResponse;
import com.coms.backend.service.SponsorService;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 후원자 공개 읽기 전용 엔드포인트 — 로그인하지 않은 방문자도 볼 수 있다
 * (SecurityConfig 의 permitAll 매처가 authenticated() catch-all 보다 위에 있어야 한다).
 *
 * <p>Sponsor images deliberately do NOT live under {@code /api/files/**}, whose matcher chain
 * ends in {@code authenticated()}.
 */
@RestController
@RequestMapping("/api/sponsors")
public class SponsorController {

    private final SponsorService sponsorService;

    public SponsorController(SponsorService sponsorService) {
        this.sponsorService = sponsorService;
    }

    @GetMapping
    public ResponseEntity<List<SponsorTierResponse>> list() {
        return ResponseEntity.ok(sponsorService.publicList());
    }

    @GetMapping("/page")
    public ResponseEntity<SponsorPageResponse> page() {
        return ResponseEntity.ok(sponsorService.page());
    }

    /**
     * Only the current banner and publicly visible, identified sponsors' logos are readable.
     * The mime is the sniffed one recorded at upload, never the client-declared content type.
     */
    @GetMapping("/images/{id}")
    public ResponseEntity<Resource> image(@PathVariable Long id) {
        SponsorImage meta = sponsorService.publicImageMeta(id);
        Resource resource = sponsorService.loadImage(meta);
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank()
                ? "sponsor-image"
                : meta.getOriginalName();
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .contentType(MediaType.parseMediaType(meta.getMime()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }
}
