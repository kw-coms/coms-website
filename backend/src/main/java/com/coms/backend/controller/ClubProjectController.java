package com.coms.backend.controller;

import com.coms.backend.domain.ClubProjectFile;
import com.coms.backend.domain.ClubProjectImage;
import com.coms.backend.dto.ClubProjectLinkStatusResponse;
import com.coms.backend.dto.ClubProjectResponse;
import com.coms.backend.dto.ClubProjectCommentRequest;
import com.coms.backend.dto.ClubProjectCommentResponse;
import com.coms.backend.dto.ClubProjectCommentUpdateRequest;
import com.coms.backend.dto.ClubProjectEngagementResponse;
import com.coms.backend.dto.ClubProjectLikeRequest;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubProjectLinkStatusService;
import com.coms.backend.service.ClubProjectService;
import com.coms.backend.service.ClubProjectSocialService;
import com.coms.backend.service.PermissionService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/club-projects")
public class ClubProjectController {

    private final ClubProjectService projectService;
    private final ClubProjectSocialService socialService;
    private final ClubProjectLinkStatusService linkStatusService;
    private final AuditLogService auditLogService;
    private final PermissionService permissionService;

    public ClubProjectController(ClubProjectService projectService,
                                 ClubProjectSocialService socialService,
                                 ClubProjectLinkStatusService linkStatusService,
                                 AuditLogService auditLogService,
                                 PermissionService permissionService) {
        this.projectService = projectService;
        this.socialService = socialService;
        this.linkStatusService = linkStatusService;
        this.auditLogService = auditLogService;
        this.permissionService = permissionService;
    }

    // Public: the /apps page and the home section render from this endpoint.
    @GetMapping
    public ResponseEntity<List<ClubProjectResponse>> list(Authentication authentication) {
        String viewer = authentication == null ? null : authentication.getName();
        return ResponseEntity.ok(projectService.list(viewer, authentication != null && canManageAll(authentication)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ClubProjectResponse> detail(@PathVariable Long id, Authentication authentication) {
        String viewer = authentication == null ? null : authentication.getName();
        return ResponseEntity.ok(projectService.detail(id, viewer, authentication != null && canManageAll(authentication)));
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/{id}/like")
    public ResponseEntity<ClubProjectEngagementResponse> setLike(@PathVariable Long id,
            @Valid @RequestBody ClubProjectLikeRequest request, Authentication authentication) {
        return ResponseEntity.ok(socialService.setLike(id, authentication.getName(), request.liked()));
    }

    @GetMapping("/{id}/comments")
    public ResponseEntity<List<ClubProjectCommentResponse>> listComments(@PathVariable Long id,
            Authentication authentication) {
        String viewer = authentication == null ? null : authentication.getName();
        return ResponseEntity.ok(socialService.listComments(id, viewer,
                authentication != null && canManageAll(authentication)));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/comments")
    public ResponseEntity<ClubProjectCommentResponse> addComment(@PathVariable Long id,
            @Valid @RequestBody ClubProjectCommentRequest request, Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(socialService.addComment(id, authentication.getName(), request));
    }

    @PreAuthorize("isAuthenticated()")
    @PatchMapping("/{id}/comments/{commentId}")
    public ResponseEntity<ClubProjectCommentResponse> updateComment(@PathVariable Long id,
            @PathVariable Long commentId, @Valid @RequestBody ClubProjectCommentUpdateRequest request,
            Authentication authentication) {
        return ResponseEntity.ok(socialService.updateComment(id, commentId, authentication.getName(), request));
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/{id}/comments/{commentId}")
    public ResponseEntity<Void> deleteComment(@PathVariable Long id, @PathVariable Long commentId,
            Authentication authentication) {
        socialService.deleteComment(id, commentId, authentication.getName(), canManageAll(authentication));
        return ResponseEntity.noContent().build();
    }

    // Members only (SecurityConfig; guests do not need it): whether each entry's link answered
    // when the server last looked. Empty until the first look after a start, and wherever the check is switched off.
    @GetMapping("/link-status")
    public ResponseEntity<List<ClubProjectLinkStatusResponse>> listClubProjectLinkStatuses() {
        return ResponseEntity.ok(linkStatusService.list());
    }

    @PreAuthorize("isAuthenticated()")
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
        boolean manager = canManageAll(authentication);
        ClubProjectResponse response = manager
                ? projectService.create(category, title, description, eyebrow, madeBy, linkUrl, displayUrl, position)
                : projectService.createForMember(authentication.getName(), category, title, description, madeBy, linkUrl);
        auditProject(authentication, manager ? "ADMIN_CLUB_PROJECT_CREATE" : "MEMBER_CLUB_PROJECT_CREATE", response);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PreAuthorize("isAuthenticated()")
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
        boolean manager = canManageAll(authentication);
        ClubProjectResponse response = manager
                ? projectService.update(id, category, title, description, eyebrow, madeBy, linkUrl, displayUrl, position)
                : projectService.updateForMember(id, authentication.getName(), category, title, description, madeBy, linkUrl);
        auditProject(authentication, manager ? "ADMIN_CLUB_PROJECT_UPDATE" : "MEMBER_CLUB_PROJECT_UPDATE", response);
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication authentication) {
        projectService.requireEditor(id, authentication.getName(), canManageAll(authentication));
        com.coms.backend.domain.ClubProject project = projectService.get(id);
        projectService.delete(id);
        auditLogService.record(actor(authentication), canManageAll(authentication) ? "ADMIN_CLUB_PROJECT_DELETE" : "MEMBER_CLUB_PROJECT_DELETE", "CLUB_PROJECT", String.valueOf(id),
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

    @PreAuthorize("isAuthenticated()")
    @PostMapping(path = "/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<Long>> uploadImages(@PathVariable Long id,
                                                    @RequestParam("images") List<MultipartFile> images,
                                                    Authentication authentication) {
        projectService.requireEditor(id, authentication.getName(), canManageAll(authentication));
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.addImages(id, images));
    }

    @GetMapping("/{id}/images/{imageId}")
    public ResponseEntity<Resource> image(@PathVariable Long id, @PathVariable Long imageId) {
        ClubProjectImage meta = projectService.loadImageMeta(id, imageId);
        return ResponseEntity.ok()
                .contentType("image/png".equals(meta.getMimeType()) ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG)
                .header("X-Content-Type-Options", "nosniff")
                .body(projectService.loadImageResource(id, imageId));
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/{id}/images/{imageId}")
    public ResponseEntity<Void> deleteImage(@PathVariable Long id, @PathVariable Long imageId,
                                             Authentication authentication) {
        projectService.requireEditor(id, authentication.getName(), canManageAll(authentication));
        projectService.deleteImage(id, imageId);
        return ResponseEntity.noContent().build();
    }

    private boolean canManageAll(Authentication authentication) {
        return permissionService.has(authentication, "PROJECT_WRITE");
    }

    private void auditProject(Authentication authentication, String verb, ClubProjectResponse response) {
        auditLogService.record(actor(authentication), verb, "CLUB_PROJECT",
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
