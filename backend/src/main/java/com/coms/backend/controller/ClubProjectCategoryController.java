package com.coms.backend.controller;

import com.coms.backend.dto.ClubProjectCategoryRequest;
import com.coms.backend.dto.ClubProjectCategoryResponse;
import com.coms.backend.service.ClubProjectCategoryService;
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
public class ClubProjectCategoryController {

    private final ClubProjectCategoryService categoryService;

    public ClubProjectCategoryController(ClubProjectCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    // Public: drives the grouped project showcase + the admin form.
    @GetMapping("/club-projects/categories")
    public ResponseEntity<List<ClubProjectCategoryResponse>> list() {
        return ResponseEntity.ok(categoryService.list());
    }

    // Admin-managed CRUD lives under /api/admin/** (guarded globally by hasRole('ADMIN')).
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/club-project-categories")
    public ResponseEntity<ClubProjectCategoryResponse> create(@Valid @RequestBody ClubProjectCategoryRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(categoryService.create(request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/admin/club-project-categories/{id}")
    public ResponseEntity<ClubProjectCategoryResponse> update(@PathVariable Long id,
                                                              @Valid @RequestBody ClubProjectCategoryRequest request) {
        return ResponseEntity.ok(categoryService.update(id, request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/club-project-categories/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        categoryService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
