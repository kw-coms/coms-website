package com.coms.backend.controller;

import com.coms.backend.domain.ClubProjectFile;
import com.coms.backend.dto.ClubProjectResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubProjectService;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
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
    private final AuditLogService auditLogService;

    public ClubProjectController(ClubProjectService projectService, AuditLogService auditLogService) {
        this.projectService = projectService;
        this.auditLogService = auditLogService;
    }

    // Public: the /apps page and the home section render from this endpoint.
    @GetMapping
    public ResponseEntity<List<ClubProjectResponse>> list() {
        return ResponseEntity.ok(projectService.list());
    }

    @PreAuthorize("@perm.has(authentication,'PROJECT_WRITE')")
    @PostMapping
    public ResponseEntity<ClubProjectResponse> create(
            @RequestParam("category") String category,
            @RequestParam("title") String title,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "eyebrow", required = false) String eyebrow,
            @RequestParam(value = "madeBy", required = false) String madeBy,
            @RequestParam(value = "linkUrl", required = false) String linkUrl,
            @RequestParam(value = "displayUrl", required = false) String displayUrl,
            @RequestParam(value = "position", required = false) Integer position,
            Authentication authentication) {
        ClubProjectResponse response = projectService.create(category, title, description, eyebrow, madeBy, linkUrl, displayUrl, position);
        auditProject(authentication, "CREATE", response);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PreAuthorize("@perm.has(authentication,'PROJECT_WRITE')")
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
            @RequestParam(value = "position", required = false) Integer position,
            Authentication authentication) {
        ClubProjectResponse response = projectService.update(id, category, title, description, eyebrow, madeBy, linkUrl, displayUrl, position);
        auditProject(authentication, "UPDATE", response);
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("@perm.has(authentication,'PROJECT_WRITE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication authentication) {
        com.coms.backend.domain.ClubProject project = projectService.get(id);
        projectService.delete(id);
        auditLogService.record(actor(authentication), "ADMIN_CLUB_PROJECT_DELETE", "CLUB_PROJECT", String.valueOf(id),
                projectAuditDetail(project.getTitle(), project.getCategory(), project.getLinkUrl()), null);
        return ResponseEntity.noContent().build();
    }

    @PreAuthorize("@perm.has(authentication,'PROJECT_WRITE')")
    @PostMapping(path = "/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Long> uploadFile(@PathVariable Long id,
                                           @RequestParam("file") MultipartFile file,
                                           Authentication authentication) {
        Long fileId = projectService.addFile(id, file);
        auditLogService.record(actor(authentication), "ADMIN_CLUB_PROJECT_FILE_CREATE", "CLUB_PROJECT_FILE",
                String.valueOf(fileId), "projectId=" + id + ", filename=" + auditValue(file.getOriginalFilename()), null);
        return ResponseEntity.status(HttpStatus.CREATED).body(fileId);
    }

    // Public download of distributables (apk/zip).
    @GetMapping("/{id}/files/{fileId}/download")
    public ResponseEntity<Resource> downloadFile(@PathVariable Long id, @PathVariable Long fileId) {
        ClubProjectFile meta = projectService.loadFileMeta(id, fileId);
        Resource resource = projectService.loadFileResource(id, fileId);
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank() ? "download" : meta.getOriginalName();
        // Always octet-stream + attachment: this endpoint is public, and echoing back the
        // client-supplied mime type would let an upload choose how browsers render it.
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @PreAuthorize("@perm.has(authentication,'PROJECT_WRITE')")
    @DeleteMapping("/{id}/files/{fileId}")
    public ResponseEntity<Void> deleteFile(@PathVariable Long id, @PathVariable Long fileId, Authentication authentication) {
        projectService.deleteFile(id, fileId);
        auditLogService.record(actor(authentication), "ADMIN_CLUB_PROJECT_FILE_DELETE", "CLUB_PROJECT_FILE",
                String.valueOf(fileId), "projectId=" + id, null);
        return ResponseEntity.noContent().build();
    }

    private void auditProject(Authentication authentication, String verb, ClubProjectResponse response) {
        auditLogService.record(actor(authentication), "ADMIN_CLUB_PROJECT_" + verb, "CLUB_PROJECT",
                String.valueOf(response.id()),
                projectAuditDetail(response.title(), response.category(), response.linkUrl()),
                null);
    }

    private String projectAuditDetail(String title, String category, String linkUrl) {
        return String.join(", ",
                "title=" + auditValue(title),
                "category=" + auditValue(category),
                "linkUrl=" + auditValue(linkUrl));
    }

    private String actor(Authentication authentication) {
        return authentication == null ? null : authentication.getName();
    }

    private String auditValue(Object value) {
        if (value == null) return "";
        String text = String.valueOf(value).replaceAll("[\\r\\n\\t]+", " ").trim();
        return text.length() > 160 ? text.substring(0, 160) : text;
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
