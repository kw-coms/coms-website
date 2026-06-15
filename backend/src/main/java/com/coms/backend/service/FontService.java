package com.coms.backend.service;

import com.coms.backend.domain.SiteFont;
import com.coms.backend.dto.SiteFontResponse;
import com.coms.backend.repository.SiteFontRepository;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@Transactional
public class FontService {
    private static final long MAX_FONT_BYTES = 2L * 1024 * 1024;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("woff", "woff2", "ttf", "otf");
    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "font/woff",
            "font/woff2",
            "font/ttf",
            "font/otf",
            "application/font-woff",
            "application/x-font-ttf",
            "application/x-font-otf",
            "application/octet-stream"
    );
    private static final Set<String> BUILT_IN_FONT_KEYS = Set.of(
            "b:pretendard",
            "b:noto-sans-kr",
            "b:ibm-plex-sans-kr",
            "b:nanum-gothic",
            "b:gowun-dodum",
            "b:nanum-myeongjo"
    );

    private final SiteFontRepository siteFontRepository;
    private final StorageService storageService;

    public FontService(SiteFontRepository siteFontRepository, StorageService storageService) {
        this.siteFontRepository = siteFontRepository;
        this.storageService = storageService;
    }

    @Transactional(readOnly = true)
    public List<SiteFontResponse> activeFonts() {
        return siteFontRepository.findByActiveTrueOrderByNameAsc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SiteFontResponse> adminFonts() {
        return siteFontRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public boolean isSelectable(Long id) {
        if (id == null) {
            return true;
        }
        return siteFontRepository.findById(id).map(SiteFont::isActive).orElse(false);
    }

    public boolean isSelectableBuiltIn(String key) {
        return key == null || BUILT_IN_FONT_KEYS.contains(key);
    }

    public SiteFontResponse upload(String name, MultipartFile file) {
        String normalizedName = name == null ? "" : name.trim();
        if (normalizedName.isEmpty() || normalizedName.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Font name is required and must be 100 characters or fewer.");
        }
        validateFile(file);
        try {
            SiteFont font = new SiteFont();
            font.setName(normalizedName);
            font.setOriginalName(file.getOriginalFilename() == null ? "font" : file.getOriginalFilename());
            font.setMimeType(file.getContentType() == null ? "application/octet-stream" : file.getContentType());
            font.setStoredName(storageService.store(file));
            return toResponse(siteFontRepository.save(font));
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store font file.");
        }
    }

    public SiteFontResponse setActive(Long id, boolean active) {
        SiteFont font = siteFontRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        font.setActive(active);
        return toResponse(font);
    }

    @Transactional(readOnly = true)
    public SiteFont font(Long id) {
        return siteFontRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public Resource load(Long id) {
        return storageService.load(font(id).getStoredName());
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Font file is required.");
        }
        if (file.getSize() > MAX_FONT_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Font file must be 2MB or smaller.");
        }
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String extension = "";
        int dot = original.lastIndexOf('.');
        if (dot >= 0 && dot < original.length() - 1) {
            extension = original.substring(dot + 1).toLowerCase(Locale.ROOT);
        }
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only woff, woff2, ttf, and otf fonts are allowed.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (!ALLOWED_MIME_TYPES.contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid font MIME type.");
        }
    }

    private SiteFontResponse toResponse(SiteFont font) {
        return new SiteFontResponse(
                font.getId(),
                font.getName(),
                "/api/fonts/" + font.getId() + "/file",
                font.isActive(),
                font.getCreatedAt()
        );
    }
}
