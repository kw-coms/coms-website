package com.coms.backend.controller;

import com.coms.backend.dto.ClubActivityCategoryRequest;
import com.coms.backend.dto.ClubActivityCategoryResponse;
import com.coms.backend.service.ClubActivityCategoryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    public ClubActivityCategoryController(ClubActivityCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    // Readable by any authenticated member (drives the activity form + filters).
    @GetMapping("/club-activities/categories")
    public ResponseEntity<List<ClubActivityCategoryResponse>> list() {
        return ResponseEntity.ok(categoryService.list());
    }

    // Admin-managed CRUD lives under /api/admin/** (guarded globally by hasRole('ADMIN')).
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/club-activity-categories")
    public ResponseEntity<ClubActivityCategoryResponse> create(@Valid @RequestBody ClubActivityCategoryRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(categoryService.create(request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/admin/club-activity-categories/{id}")
    public ResponseEntity<ClubActivityCategoryResponse> update(@PathVariable Long id,
                                                               @Valid @RequestBody ClubActivityCategoryRequest request) {
        return ResponseEntity.ok(categoryService.update(id, request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/club-activity-categories/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        categoryService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
