package com.coms.backend.controller;

import com.coms.backend.dto.AppCatalogRequest;
import com.coms.backend.dto.AppCatalogResponse;
import com.coms.backend.service.AppCatalogService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/apps")
public class AppCatalogController {

    private final AppCatalogService appCatalogService;

    public AppCatalogController(AppCatalogService appCatalogService) {
        this.appCatalogService = appCatalogService;
    }

    @GetMapping
    public ResponseEntity<List<AppCatalogResponse>> list() {
        return ResponseEntity.ok(appCatalogService.list());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<AppCatalogResponse> create(@Valid @RequestBody AppCatalogRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(appCatalogService.create(request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public ResponseEntity<AppCatalogResponse> update(@PathVariable Long id, @Valid @RequestBody AppCatalogRequest request) {
        return ResponseEntity.ok(appCatalogService.update(id, request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        appCatalogService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
