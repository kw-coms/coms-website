package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.MiniAppDocument;
import com.coms.backend.dto.MiniAppDocumentRequest;
import com.coms.backend.dto.MiniAppDocumentResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.MiniAppDocumentRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Set;

@Service
@Transactional
public class MiniAppDocumentService {
    private static final Set<String> ALLOWED_APPS = Set.of("worldcup", "tier");
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("template", "result");
    private static final int MAX_PAYLOAD_CHARS = 1_000_000;
    private static final char[] SLUG_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789".toCharArray();

    private final MiniAppDocumentRepository repository;
    private final MemberRepository memberRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SecureRandom secureRandom = new SecureRandom();

    public MiniAppDocumentService(MiniAppDocumentRepository repository, MemberRepository memberRepository) {
        this.repository = repository;
        this.memberRepository = memberRepository;
    }

    public MiniAppDocumentResponse saveProfileDocument(String ownerStudentId, String app, String contentType, String contentId, MiniAppDocumentRequest request) {
        String cleanApp = requireAllowed(app, ALLOWED_APPS, "Invalid mini app");
        String cleanType = requireAllowed(contentType, ALLOWED_CONTENT_TYPES, "Invalid document type");
        String owner = requireText(ownerStudentId, "Owner required", 50);
        String cleanContentId = requireText(contentId, "contentId required", 120);
        Member member = memberRepository.findByStudentId(owner)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        MiniAppDocument document = repository.findByAppAndContentTypeAndOwnerStudentIdAndContentId(cleanApp, cleanType, owner, cleanContentId)
                .orElseGet(MiniAppDocument::new);
        document.setApp(cleanApp);
        document.setContentType(cleanType);
        document.setContentId(cleanContentId);
        document.setOwnerStudentId(owner);
        document.setOwnerName(member.getName());
        document.setTitle(requireText(request.title(), "title required", 160));
        document.setDescription(optionalText(request.description(), 500));
        document.setPayloadJson(writePayload(request.payload()));
        if (Boolean.TRUE.equals(request.shared())) {
            markShared(document);
        }
        return toResponse(repository.save(document));
    }

    @Transactional(readOnly = true)
    public java.util.List<MiniAppDocumentResponse> listProfileDocuments(String ownerStudentId, String app) {
        String owner = requireText(ownerStudentId, "Owner required", 50);
        String cleanApp = requireAllowed(app, ALLOWED_APPS, "Invalid mini app");
        return repository.findByAppAndOwnerStudentIdOrderByUpdatedAtDesc(cleanApp, owner).stream()
                .map(this::toResponse)
                .toList();
    }

    public MiniAppDocumentResponse shareDocument(String ownerStudentId, String app, String contentType, String contentId) {
        MiniAppDocument document = findOwnerDocument(ownerStudentId, app, contentType, contentId);
        markShared(document);
        return toResponse(repository.save(document));
    }

    public MiniAppDocumentResponse unshareDocument(String ownerStudentId, String app, String contentType, String contentId) {
        MiniAppDocument document = findOwnerDocument(ownerStudentId, app, contentType, contentId);
        document.setShared(false);
        document.setSharedAt(null);
        return toResponse(repository.save(document));
    }

    @Transactional(readOnly = true)
    public java.util.List<MiniAppDocumentResponse> listSharedDocuments(String app) {
        String cleanApp = requireAllowed(app, ALLOWED_APPS, "Invalid mini app");
        return repository.findTop100ByAppAndSharedTrueOrderBySharedAtDesc(cleanApp).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public MiniAppDocumentResponse getSharedDocument(String app, String shareSlug) {
        String cleanApp = requireAllowed(app, ALLOWED_APPS, "Invalid mini app");
        String slug = requireText(shareSlug, "shareSlug required", 80);
        return repository.findByAppAndShareSlugAndSharedTrue(cleanApp, slug)
                .map(this::toResponse)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared document not found"));
    }

    private MiniAppDocument findOwnerDocument(String ownerStudentId, String app, String contentType, String contentId) {
        String owner = requireText(ownerStudentId, "Owner required", 50);
        String cleanApp = requireAllowed(app, ALLOWED_APPS, "Invalid mini app");
        String cleanType = requireAllowed(contentType, ALLOWED_CONTENT_TYPES, "Invalid document type");
        String cleanContentId = requireText(contentId, "contentId required", 120);
        return repository.findByAppAndContentTypeAndOwnerStudentIdAndContentId(cleanApp, cleanType, owner, cleanContentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Mini app document not found"));
    }

    private void markShared(MiniAppDocument document) {
        document.setShared(true);
        if (document.getShareSlug() == null || document.getShareSlug().isBlank()) {
            document.setShareSlug(nextSlug());
        }
        if (document.getSharedAt() == null) {
            document.setSharedAt(LocalDateTime.now());
        }
    }

    private String nextSlug() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder slug = new StringBuilder(12);
            for (int i = 0; i < 12; i++) {
                slug.append(SLUG_CHARS[secureRandom.nextInt(SLUG_CHARS.length)]);
            }
            String value = slug.toString();
            if (!repository.existsByShareSlug(value)) {
                return value;
            }
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create share link");
    }

    private MiniAppDocumentResponse toResponse(MiniAppDocument document) {
        return new MiniAppDocumentResponse(
                document.getId(),
                document.getApp(),
                document.getContentType(),
                document.getContentId(),
                document.getTitle(),
                document.getDescription(),
                document.getOwnerStudentId(),
                document.getOwnerName(),
                document.isShared(),
                document.getShareSlug(),
                shareUrl(document),
                readPayload(document.getPayloadJson()),
                document.getCreatedAt(),
                document.getUpdatedAt(),
                document.getSharedAt()
        );
    }

    private String shareUrl(MiniAppDocument document) {
        if (!document.isShared() || document.getShareSlug() == null || document.getShareSlug().isBlank()) {
            return null;
        }
        return "/" + document.getApp() + "/shared/" + document.getShareSlug();
    }

    private String writePayload(Map<String, Object> payload) {
        try {
            String json = objectMapper.writeValueAsString(payload == null ? Map.of() : payload);
            if (json.length() > MAX_PAYLOAD_CHARS) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mini app document is too large");
            }
            return json;
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid mini app payload");
        }
    }

    private Map<String, Object> readPayload(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private static String requireAllowed(String value, Set<String> allowed, String message) {
        String clean = requireText(value, message, 80).toLowerCase(java.util.Locale.ROOT);
        if (!allowed.contains(clean)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return clean;
    }

    private static String requireText(String value, String message, int maxLength) {
        String clean = value == null ? "" : value.trim();
        if (clean.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return clean.length() > maxLength ? clean.substring(0, maxLength) : clean;
    }

    private static String optionalText(String value, int maxLength) {
        String clean = value == null ? "" : value.trim();
        if (clean.isBlank()) {
            return null;
        }
        return clean.length() > maxLength ? clean.substring(0, maxLength) : clean;
    }
}
