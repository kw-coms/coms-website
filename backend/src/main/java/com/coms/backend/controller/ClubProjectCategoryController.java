package com.coms.backend.controller;

import com.coms.backend.dto.ClubProjectCategoryRequest;
import com.coms.backend.dto.ClubProjectCategoryResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubProjectCategoryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ClubProjectCategoryController {

    private final ClubProjectCategoryService categoryService;
    private final AuditLogService auditLogService;

    public ClubProjectCategoryController(ClubProjectCategoryService categoryService, AuditLogService auditLogService) {
        this.categoryService = categoryService;
        this.auditLogService = auditLogService;
    }

    // Public: drives the grouped project showcase + the admin form.
    @GetMapping("/club-projects/categories")
    public ResponseEntity<List<ClubProjectCategoryResponse>> list() {
        return ResponseEntity.ok(categoryService.list());
    }

    // Content managers maintain the public project showcase taxonomy.
    @PreAuthorize("@perm.has(authentication,'PROJECT_WRITE')")
    @PostMapping("/admin/club-project-categories")
    public ResponseEntity<ClubProjectCategoryResponse> create(@Valid @RequestBody ClubProjectCategoryRequest request,
                                                              Authentication authentication) {
        ClubProjectCategoryResponse response = categoryService.create(request);
        auditCategory(authentication, "CREATE", response);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PreAuthorize("@perm.has(authentication,'PROJECT_WRITE')")
    @PatchMapping("/admin/club-project-categories/{id}")
    public ResponseEntity<ClubProjectCategoryResponse> update(@PathVariable Long id,
                                                              @Valid @RequestBody ClubProjectCategoryRequest request,
                                                              Authentication authentication) {
        ClubProjectCategoryResponse response = categoryService.update(id, request);
        auditCategory(authentication, "UPDATE", response);
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("@perm.has(authentication,'PROJECT_WRITE')")
    @DeleteMapping("/admin/club-project-categories/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication authentication) {
        categoryService.delete(id);
        auditLogService.record(actor(authentication), "ADMIN_CLUB_PROJECT_CATEGORY_DELETE",
                "CLUB_PROJECT_CATEGORY", String.valueOf(id), null, null);
        return ResponseEntity.noContent().build();
    }

    private void auditCategory(Authentication authentication, String verb, ClubProjectCategoryResponse response) {
        auditLogService.record(actor(authentication), "ADMIN_CLUB_PROJECT_CATEGORY_" + verb,
                "CLUB_PROJECT_CATEGORY", String.valueOf(response.id()),
                String.join(", ",
                        "key=" + auditValue(response.key()),
                        "name=" + auditValue(response.name()),
                        "position=" + response.position(),
                        "projectCount=" + response.projectCount()),
                null);
    }

    private String actor(Authentication authentication) {
        return authentication == null ? null : authentication.getName();
    }

    private String auditValue(Object value) {
        if (value == null) return "";
        String text = String.valueOf(value).replaceAll("[\\r\\n\\t]+", " ").trim();
        return text.length() > 160 ? text.substring(0, 160) : text;
    }
}
