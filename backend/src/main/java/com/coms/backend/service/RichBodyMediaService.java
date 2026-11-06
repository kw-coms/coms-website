package com.coms.backend.service;

import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RichBodyMediaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

@Service
public class RichBodyMediaService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RichBodyMediaService.class);
    private final RichBodyMediaRepository repository;
    private final MemberRepository members;
    private final StorageService storage;
    private final MediaUploadValidator validator;
    private final Clock clock;
    private final RichBodyMediaDeleter deleter;

    public RichBodyMediaService(RichBodyMediaRepository repository, MemberRepository members,
                                StorageService storage, MediaUploadValidator validator, Clock clock, RichBodyMediaDeleter deleter) {
        this.repository = repository; this.members = members; this.storage = storage;
        this.validator = validator; this.clock = clock; this.deleter = deleter;
    }

    public static RichBodyMedia.Scope parseScope(String raw) {
        try { return RichBodyMedia.Scope.valueOf(raw.toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알 수 없는 업로드 범위입니다.");
        }
    }

    @Transactional
    public RichBodyMedia upload(RichBodyMedia.Scope scope, RichBodyMedia.Kind kind, MultipartFile file, String studentId) {
        if (file == null || file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "파일을 선택해주세요.");
        var member = members.findByStudentId(studentId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String type = switch (kind) {
            case IMAGE -> validator.validateImage(file);
            case VIDEO -> validator.validateVideo(file);
            case FILE -> validator.validateFile(file);
        };
        String original = MediaUploadValidator.cleanOriginalFilename(file).trim();
        if (original.isBlank() || original.length() > 255 || original.contains("..")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "올바른 파일 이름이 필요합니다.");
        }
        try {
            String stored = kind == RichBodyMedia.Kind.IMAGE ? storage.storeImage(file, type) : storage.store(file);
            try { return repository.saveAndFlush(new RichBodyMedia(kind, scope, stored, original, type, file.getSize(), member.getId())); }
            catch (RuntimeException e) { storage.delete(stored); throw e; }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        }
    }

    @Transactional(readOnly = true)
    public RichBodyMedia get(Long id, String studentId) {
        RichBodyMedia media = repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (media.getScope() != RichBodyMedia.Scope.SPONSOR && studentId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return media;
    }

    public Resource load(RichBodyMedia media) { return storage.load(media.getStoredName()); }

    @Transactional
    public void syncAttachments(RichBodyMedia.Scope scope, Long ownerId, String content, String actorStudentId) {
        Set<Long> referenced = new HashSet<>();
        try {
            JsonNode blocks = JSON.readTree(content == null ? "" : content);
            if (blocks != null && blocks.isArray()) for (JsonNode block : blocks) {
                String type = block.path("type").asText();
                RichBodyMedia.Kind kind = switch (type) {
                    case "image" -> RichBodyMedia.Kind.IMAGE;
                    case "video" -> RichBodyMedia.Kind.VIDEO;
                    case "file" -> RichBodyMedia.Kind.FILE;
                    default -> null;
                };
                if (kind == null) continue;
                JsonNode idNode = block.path(kind == RichBodyMedia.Kind.FILE ? "fileId" : "mediaId");
                if (!idNode.canConvertToLong() || idNode.longValue() <= 0) continue;
                Long id = idNode.longValue();
                var candidate = repository.findLockedById(id);
                if (candidate.isEmpty()) continue;
                RichBodyMedia row = candidate.get();
                if (row.getScope() != scope || row.getKind() != kind) continue;
                if (ownerId.equals(row.getOwnerId())) { referenced.add(id); continue; }
                if (row.getOwnerId() != null || actorStudentId == null) continue;
                var actor = members.findByStudentId(actorStudentId);
                if (actor.isEmpty() || !actor.get().getId().equals(row.getUploaderId())) continue;
                row.attach(ownerId, LocalDateTime.now(clock));
                referenced.add(id);
            }
        } catch (IOException ignored) {
            // Legacy plain text has no media references.
        }
        for (RichBodyMedia row : repository.findByScopeAndOwnerId(scope, ownerId)) {
            if (!referenced.contains(row.getId())) row.detach();
        }
    }

    @Transactional
    public void detachAttachments(RichBodyMedia.Scope scope, Long ownerId) {
        for (RichBodyMedia row : repository.findByScopeAndOwnerId(scope, ownerId)) row.detach();
    }

    public int deleteOrphanedOlderThan(LocalDateTime cutoff) {
        int removed = 0;
        for (RichBodyMedia candidate : repository.findByOwnerIdIsNullAndCreatedAtBefore(cutoff)) {
            try {
                if (deleter.deleteIfStillOrphan(candidate.getId(), cutoff)) removed++;
            } catch (RuntimeException e) {
                log.warn("Could not purge orphan rich media {}", candidate.getId(), e);
            }
        }
        return removed;
    }
}
