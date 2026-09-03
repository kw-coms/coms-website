package com.coms.backend.controller;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.dto.ArchiveAuthorUpdateRequest;
import com.coms.backend.dto.ArchiveFileResponse;
import com.coms.backend.dto.EngagementVoteRequest;
import com.coms.backend.service.ArchiveService;
import com.coms.backend.service.StorageService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import com.coms.backend.web.ListPagination;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/files")
public class ArchiveController {
    // An archive entry's stored blob is written once at upload and never replaced
    // (ArchiveService.upload is the only caller of setStoredName), so /{id}/download
    // and /{id}/inline are immutable for the life of the entry. cachePrivate because
    // /api/files/** requires a signed-in member.
    private static final CacheControl IMMUTABLE_BLOB =
            CacheControl.maxAge(30, TimeUnit.DAYS).cachePrivate().immutable();

    private final ArchiveService archiveService;
    private final StorageService storageService;

    public ArchiveController(ArchiveService archiveService, StorageService storageService) {
        this.archiveService = archiveService;
        this.storageService = storageService;
    }

    @PostMapping
    public ResponseEntity<ArchiveFileResponse> upload(
            @RequestParam("title") String title,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "category", defaultValue = "GENERAL") String category,
            @RequestParam("file") MultipartFile file,
            Authentication authentication) throws IOException {
        return ResponseEntity.ok(archiveService.upload(title, description, category, file, authentication.getName()));
    }

    @GetMapping
    public ResponseEntity<List<ArchiveFileResponse>> list(Authentication authentication,
                                                          @RequestParam(required = false) Integer page,
                                                          @RequestParam(required = false) Integer size) {
        return ListPagination.paginate(
                archiveService.list(authentication == null ? null : authentication.getName()), page, size);
    }

    // 부회장 이상 전용 — SecurityConfig의 PATCH /api/files/** hasRole("VICE_PRESIDENT") 규칙이 게이트.
    @PatchMapping("/{id}/author")
    public ResponseEntity<ArchiveFileResponse> updateAuthor(@PathVariable Long id,
                                                            @Valid @RequestBody ArchiveAuthorUpdateRequest request,
                                                            Authentication authentication) {
        return ResponseEntity.ok(archiveService.updateAuthor(id, request.uploaderName(), authentication.getName()));
    }

    @PostMapping("/{id}/vote")
    public ResponseEntity<ArchiveFileResponse> vote(Authentication authentication,
                                                    @PathVariable Long id,
                                                    @Valid @RequestBody EngagementVoteRequest request) {
        return ResponseEntity.ok(archiveService.vote(authentication.getName(), id, request.value()));
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable Long id) {
        ArchiveFile file = archiveService.get(id);
        archiveService.incrementView(id);
        Resource resource = storageService.load(file.getStoredName());
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(file.getOriginalName(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .cacheControl(IMMUTABLE_BLOB)
                .contentType(mediaType(file.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    @GetMapping("/{id}/inline")
    public ResponseEntity<Resource> inline(@PathVariable Long id) {
        ArchiveFile file = archiveService.get(id);
        Resource resource = storageService.load(file.getStoredName());
        MediaType mediaType = mediaType(file.getMimeType());
        // Only render images and PDFs inline. Anything else (HTML, SVG, scripts, ...) is forced to
        // download as an attachment so the browser never renders it, neutralizing stored XSS even if
        // a dangerous content-type slipped past upload validation. SVG (image/svg+xml) is excluded
        // from the inline allowlist because it can carry script.
        boolean inlineSafe = isInlineSafe(mediaType);
        ContentDisposition disposition = (inlineSafe
                ? ContentDisposition.inline()
                : ContentDisposition.attachment())
                .filename(file.getOriginalName(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .cacheControl(IMMUTABLE_BLOB)
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    private boolean isInlineSafe(MediaType mediaType) {
        if (MediaType.APPLICATION_PDF.equalsTypeAndSubtype(mediaType)) {
            return true;
        }
        return "image".equalsIgnoreCase(mediaType.getType())
                && !"svg+xml".equalsIgnoreCase(mediaType.getSubtype());
    }

    private MediaType mediaType(String mimeType) {
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        archiveService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
