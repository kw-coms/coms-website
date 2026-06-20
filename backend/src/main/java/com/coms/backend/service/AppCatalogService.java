package com.coms.backend.service;

import com.coms.backend.domain.AppCatalogEntry;
import com.coms.backend.dto.AppCatalogRequest;
import com.coms.backend.dto.AppCatalogResponse;
import com.coms.backend.repository.AppCatalogRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
@Transactional
public class AppCatalogService {

    private final AppCatalogRepository repository;

    public AppCatalogService(AppCatalogRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<AppCatalogResponse> list() {
        return repository.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(this::toResponse)
                .toList();
    }

    public AppCatalogResponse create(AppCatalogRequest request) {
        AppCatalogEntry entry = new AppCatalogEntry();
        applyFields(entry, request);
        entry.setCreatedAt(LocalDateTime.now());
        entry.setUpdatedAt(LocalDateTime.now());
        return toResponse(repository.save(entry));
    }

    public AppCatalogResponse update(Long id, AppCatalogRequest request) {
        AppCatalogEntry entry = get(id);
        applyFields(entry, request);
        entry.setUpdatedAt(LocalDateTime.now());
        return toResponse(repository.save(entry));
    }

    public void delete(Long id) {
        AppCatalogEntry entry = get(id);
        repository.delete(entry);
    }

    @Transactional(readOnly = true)
    public AppCatalogEntry get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void applyFields(AppCatalogEntry entry, AppCatalogRequest request) {
        if (request.title() == null || request.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "앱 제목을 입력하세요.");
        }
        entry.setTitle(request.title().trim());
        entry.setEyebrow(request.eyebrow() != null && !request.eyebrow().isBlank() ? request.eyebrow().trim() : null);
        entry.setBody(request.body() != null && !request.body().isBlank() ? request.body().trim() : null);
        entry.setHref(request.href() != null && !request.href().isBlank() ? request.href().trim() : null);
        entry.setSortOrder(request.sortOrder() != null ? request.sortOrder() : 0);
    }

    private AppCatalogResponse toResponse(AppCatalogEntry entry) {
        return new AppCatalogResponse(
                entry.getId(),
                entry.getTitle(),
                entry.getEyebrow(),
                entry.getBody(),
                entry.getHref(),
                entry.getSortOrder()
        );
    }
}
