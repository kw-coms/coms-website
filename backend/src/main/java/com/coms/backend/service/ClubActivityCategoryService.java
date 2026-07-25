package com.coms.backend.service;

import com.coms.backend.domain.ClubActivityCategory;
import com.coms.backend.dto.ClubActivityCategoryRequest;
import com.coms.backend.dto.ClubActivityCategoryResponse;
import com.coms.backend.repository.ClubActivityCategoryRepository;
import com.coms.backend.repository.ClubActivityRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional
public class ClubActivityCategoryService {

    private final ClubActivityCategoryRepository categoryRepository;
    private final ClubActivityRepository activityRepository;

    public ClubActivityCategoryService(ClubActivityCategoryRepository categoryRepository,
                                       ClubActivityRepository activityRepository) {
        this.categoryRepository = categoryRepository;
        this.activityRepository = activityRepository;
    }

    @Transactional(readOnly = true)
    public List<ClubActivityCategoryResponse> list() {
        Map<String, Long> counts = activityRepository.countByCategory().stream()
                .collect(Collectors.toMap(
                        row -> (String) row[0],
                        row -> (Long) row[1],
                        (a, b) -> a + b));
        return categoryRepository.findAllByOrderByPositionAscIdAsc().stream()
                .map(category -> toResponse(category, counts.getOrDefault(category.getKey(), 0L)))
                .toList();
    }

    public ClubActivityCategoryResponse create(ClubActivityCategoryRequest request) {
        String name = requireName(request.name());
        String key = resolveKey(request.key(), name);
        if (categoryRepository.existsByKey(key)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 존재하는 분류 키입니다.");
        }
        ClubActivityCategory category = new ClubActivityCategory();
        category.setKey(key);
        category.setName(name);
        category.setPosition(request.position() != null ? request.position() : nextPosition());
        ClubActivityCategory saved = categoryRepository.save(category);
        return toResponse(saved, 0L);
    }

    public ClubActivityCategoryResponse update(Long id, ClubActivityCategoryRequest request) {
        ClubActivityCategory category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "분류를 찾을 수 없습니다."));
        category.setName(requireName(request.name()));
        if (request.position() != null) {
            category.setPosition(request.position());
        }
        ClubActivityCategory saved = categoryRepository.save(category);
        long count = activityRepository.countByCategory(saved.getKey());
        return toResponse(saved, count);
    }

    @Transactional(readOnly = true)
    public ClubActivityCategoryResponse get(Long id) {
        ClubActivityCategory category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "분류를 찾을 수 없습니다."));
        long count = activityRepository.countByCategory(category.getKey());
        return toResponse(category, count);
    }

    public void delete(Long id) {
        ClubActivityCategory category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "분류를 찾을 수 없습니다."));
        long inUse = activityRepository.countByCategory(category.getKey());
        if (inUse > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "이 분류를 사용하는 활동 기록이 " + inUse + "건 있어 삭제할 수 없습니다. 먼저 다른 분류로 변경하세요.");
        }
        categoryRepository.delete(category);
    }

    @Transactional(readOnly = true)
    public void requireValidKey(String key) {
        if (!categoryRepository.existsByKey(key)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "유효하지 않은 활동 분류입니다.");
        }
    }

    @Transactional(readOnly = true)
    public Map<String, String> keyToNameMap() {
        return categoryRepository.findAllByOrderByPositionAscIdAsc().stream()
                .collect(Collectors.toMap(ClubActivityCategory::getKey, ClubActivityCategory::getName,
                        (a, b) -> a, java.util.LinkedHashMap::new));
    }

    private int nextPosition() {
        return categoryRepository.findAllByOrderByPositionAscIdAsc().stream()
                .mapToInt(ClubActivityCategory::getPosition)
                .max()
                .orElse(-1) + 1;
    }

    private String requireName(String name) {
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "분류 이름을 입력하세요.");
        }
        return name.trim();
    }

    private String resolveKey(String requestedKey, String name) {
        String base = requestedKey != null && !requestedKey.isBlank() ? requestedKey : slugify(name);
        String normalized = base.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_]", "_");
        normalized = normalized.replaceAll("_+", "_").replaceAll("^_|_$", "");
        if (normalized.isBlank()) {
            normalized = "CATEGORY";
        }
        if (normalized.length() > 40) {
            normalized = normalized.substring(0, 40);
        }
        // Ensure uniqueness by appending a numeric suffix if needed.
        String candidate = normalized;
        int suffix = 2;
        while (categoryRepository.existsByKey(candidate)) {
            String tail = "_" + suffix++;
            int max = 40 - tail.length();
            candidate = (normalized.length() > max ? normalized.substring(0, max) : normalized) + tail;
        }
        return candidate;
    }

    private String slugify(String name) {
        String ascii = Normalizer.normalize(name, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return ascii.replaceAll("[^A-Za-z0-9]+", "_");
    }

    private ClubActivityCategoryResponse toResponse(ClubActivityCategory category, long activityCount) {
        return new ClubActivityCategoryResponse(
                category.getId(),
                category.getKey(),
                category.getName(),
                category.getPosition(),
                activityCount
        );
    }
}
