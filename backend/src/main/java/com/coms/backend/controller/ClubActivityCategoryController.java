package com.coms.backend.controller;

import com.coms.backend.dto.ClubActivityCategoryRequest;
import com.coms.backend.dto.ClubActivityCategoryResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubActivityCategoryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
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
public class ClubActivityCategoryController {

    private final ClubActivityCategoryService categoryService;
    private final AuditLogService auditLogService;

    public ClubActivityCategoryController(ClubActivityCategoryService categoryService,
                                          AuditLogService auditLogService) {
        this.categoryService = categoryService;
        this.auditLogService = auditLogService;
    }

    // Readable by any authenticated member (drives the activity form + filters).
    @GetMapping("/club-activities/categories")
    public ResponseEntity<List<ClubActivityCategoryResponse>> list() {
        return ResponseEntity.ok(categoryService.list());
    }

    // Content managers maintain the labels used by the member-only activity log.
    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    @PostMapping("/admin/club-activity-categories")
    public ResponseEntity<ClubActivityCategoryResponse> create(@Valid @RequestBody ClubActivityCategoryRequest request,
                                                               Authentication authentication) {
        ClubActivityCategoryResponse response = categoryService.create(request);
        recordCategoryAudit(authentication, "ADMIN_CLUB_ACTIVITY_CATEGORY_CREATE", response);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    @PatchMapping("/admin/club-activity-categories/{id}")
    public ResponseEntity<ClubActivityCategoryResponse> update(@PathVariable Long id,
                                                               @Valid @RequestBody ClubActivityCategoryRequest request,
                                                               Authentication authentication) {
        ClubActivityCategoryResponse response = categoryService.update(id, request);
        recordCategoryAudit(authentication, "ADMIN_CLUB_ACTIVITY_CATEGORY_UPDATE", response);
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    @DeleteMapping("/admin/club-activity-categories/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication authentication) {
        ClubActivityCategoryResponse category = categoryService.get(id);
        categoryService.delete(id);
        recordCategoryAudit(authentication, "ADMIN_CLUB_ACTIVITY_CATEGORY_DELETE", category);
        return ResponseEntity.noContent().build();
    }

    private void recordCategoryAudit(Authentication authentication,
                                     String action,
                                     ClubActivityCategoryResponse category) {
        auditLogService.record(
                authentication.getName(),
                action,
                "CLUB_ACTIVITY_CATEGORY",
                String.valueOf(category.id()),
                categoryDetail(category),
                null
        );
    }

    private String categoryDetail(ClubActivityCategoryResponse category) {
        StringBuilder detail = new StringBuilder();
        append(detail, "key", category.key());
        append(detail, "name", category.name());
        append(detail, "position", category.position());
        append(detail, "activityCount", category.activityCount());
        return detail.toString();
    }

    private void append(StringBuilder detail, String key, Object value) {
        if (value == null) {
            return;
        }
        if (!detail.isEmpty()) {
            detail.append('\n');
        }
        detail.append(key).append('=').append(value);
    }
}
