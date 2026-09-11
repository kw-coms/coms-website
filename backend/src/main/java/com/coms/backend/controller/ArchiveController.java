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
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import com.coms.backend.web.ListPagination;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/files")
public class ArchiveController {
    // Archive blobs can now be replaced while keeping the same entry id, so the bare URLs must not
    // be cached as immutable. Clients that want stable cache busting append ?v=contentVersion.
    private static final CacheControl REVALIDATE_BLOB = CacheControl.noStore().cachePrivate();

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

    // archive.manage 권한 — 기본값은 부회장(VICE_PRESIDENT)이고, 회장이 권한 매트릭스에서 조정한다.
    @PreAuthorize("@perm.has(authentication,'ARCHIVE_MANAGE')")
    @PatchMapping("/{id}/author")
    public ResponseEntity<ArchiveFileResponse> updateAuthor(@PathVariable Long id,
                                                            @Valid @RequestBody ArchiveAuthorUpdateRequest request,
                                                            Authentication authentication) {
        return ResponseEntity.ok(archiveService.updateAuthor(id, request.uploaderName(), request.studentId(), authentication.getName()));
    }

    @PutMapping(path = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ArchiveFileResponse> update(Authentication authentication,
                                                      @PathVariable Long id,
                                                      @RequestParam("title") String title,
                                                      @RequestParam(value = "description", required = false) String description,
                                                      @RequestParam(value = "category", defaultValue = "GENERAL") String category,
                                                      @RequestParam(value = "file", required = false) MultipartFile file) throws IOException {
        return ResponseEntity.ok(archiveService.update(authentication.getName(), id, title, description, category, file));
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
                .cacheControl(REVALIDATE_BLOB)
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
                .cacheControl(REVALIDATE_BLOB)
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

    @PreAuthorize("@perm.has(authentication,'ARCHIVE_MANAGE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        archiveService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
