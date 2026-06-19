package com.coms.backend.controller;

import com.coms.backend.domain.ClubProjectFile;
import com.coms.backend.dto.ClubProjectResponse;
import com.coms.backend.service.ClubProjectService;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/club-projects")
public class ClubProjectController {

    private final ClubProjectService projectService;

    public ClubProjectController(ClubProjectService projectService) {
        this.projectService = projectService;
    }

    // Public: the /apps page and the home section render from this endpoint.
    @GetMapping
    public ResponseEntity<List<ClubProjectResponse>> list() {
        return ResponseEntity.ok(projectService.list());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<ClubProjectResponse> create(
            @RequestParam("category") String category,
            @RequestParam("title") String title,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "eyebrow", required = false) String eyebrow,
            @RequestParam(value = "madeBy", required = false) String madeBy,
            @RequestParam(value = "linkUrl", required = false) String linkUrl,
            @RequestParam(value = "displayUrl", required = false) String displayUrl,
            @RequestParam(value = "position", required = false) Integer position) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(projectService.create(category, title, description, eyebrow, madeBy, linkUrl, displayUrl, position));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/{id}")
    public ResponseEntity<ClubProjectResponse> update(
            @PathVariable Long id,
            @RequestParam(value = "category", required = false) String category,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "eyebrow", required = false) String eyebrow,
            @RequestParam(value = "madeBy", required = false) String madeBy,
            @RequestParam(value = "linkUrl", required = false) String linkUrl,
            @RequestParam(value = "displayUrl", required = false) String displayUrl,
            @RequestParam(value = "position", required = false) Integer position) {
        return ResponseEntity.ok(
                projectService.update(id, category, title, description, eyebrow, madeBy, linkUrl, displayUrl, position));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        projectService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping(path = "/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Long> uploadFile(@PathVariable Long id,
                                           @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.addFile(id, file));
    }

    // Public download of distributables (apk/zip).
    @GetMapping("/{id}/files/{fileId}/download")
    public ResponseEntity<Resource> downloadFile(@PathVariable Long id, @PathVariable Long fileId) {
        ClubProjectFile meta = projectService.loadFileMeta(id, fileId);
        Resource resource = projectService.loadFileResource(id, fileId);
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank() ? "download" : meta.getOriginalName();
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}/files/{fileId}")
    public ResponseEntity<Void> deleteFile(@PathVariable Long id, @PathVariable Long fileId) {
        projectService.deleteFile(id, fileId);
        return ResponseEntity.noContent().build();
    }

    private MediaType mediaType(String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
