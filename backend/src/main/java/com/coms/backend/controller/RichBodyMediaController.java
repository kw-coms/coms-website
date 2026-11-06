package com.coms.backend.controller;

import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.service.RichBodyMediaService;
import com.coms.backend.web.SafeMediaTypes;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/rich-media")
public class RichBodyMediaController {
    private static final CacheControl BLOB_CACHE = CacheControl.maxAge(30, TimeUnit.DAYS).cachePrivate().immutable();
    private final RichBodyMediaService service;
    public RichBodyMediaController(RichBodyMediaService service) { this.service = service; }

    public record UploadResponse(Long id, RichBodyMedia.Kind kind, String name, long size) {}

    @PreAuthorize("(authentication != null and isAuthenticated()) and " +
            "((#scope.equalsIgnoreCase('notice') and @perm.has(authentication,'NOTICE_WRITE')) or " +
            "(#scope.equalsIgnoreCase('archive')) or " +
            "(#scope.equalsIgnoreCase('sponsor') and hasRole('ADMIN')) or " +
            "(!#scope.equalsIgnoreCase('notice') and !#scope.equalsIgnoreCase('archive') and !#scope.equalsIgnoreCase('sponsor')))")
    @PostMapping(path = "/{scope}/{kind}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadResponse upload(@PathVariable String scope, @PathVariable String kind,
                                 @RequestParam(required = false) MultipartFile image,
                                 @RequestParam(required = false) MultipartFile video,
                                 @RequestParam(required = false) MultipartFile file,
                                 Authentication authentication) {
        RichBodyMedia.Scope parsedScope = RichBodyMediaService.parseScope(scope);
        RichBodyMedia.Kind parsedKind = switch (kind.toLowerCase(java.util.Locale.ROOT)) {
            case "images" -> RichBodyMedia.Kind.IMAGE;
            case "videos" -> RichBodyMedia.Kind.VIDEO;
            case "files" -> RichBodyMedia.Kind.FILE;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알 수 없는 파일 종류입니다.");
        };
        MultipartFile part = switch (parsedKind) {
            case IMAGE -> image;
            case VIDEO -> video;
            case FILE -> file;
        };
        RichBodyMedia saved = service.upload(parsedScope, parsedKind, part, authentication.getName());
        return new UploadResponse(saved.getId(), saved.getKind(), saved.getOriginalName(), saved.getSizeBytes());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Resource> inline(@PathVariable Long id, Authentication authentication) {
        return serve(id, authentication, false);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable Long id, Authentication authentication) {
        return serve(id, authentication, true);
    }

    private ResponseEntity<Resource> serve(Long id, Authentication authentication, boolean download) {
        String studentId = authentication == null || authentication instanceof org.springframework.security.authentication.AnonymousAuthenticationToken
                ? null : authentication.getName();
        RichBodyMedia media = service.get(id, studentId);
        boolean attachment = download || media.getKind() == RichBodyMedia.Kind.FILE;
        MediaType contentType = attachment ? SafeMediaTypes.forDownload(media.getContentType())
                : SafeMediaTypes.parseOrOctetStream(media.getContentType());
        ContentDisposition disposition = (attachment ? ContentDisposition.attachment() : ContentDisposition.inline())
                .filename(media.getOriginalName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().cacheControl(BLOB_CACHE).contentType(contentType)
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(service.load(media));
    }
}
