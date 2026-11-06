package com.coms.backend.service;

import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RichBodyMediaRepository;
import com.coms.backend.security.SlidingWindowRateLimiter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Locale;
import java.util.Set;

import static com.coms.backend.service.MediaUploadValidator.*;

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
    private final TransactionTemplate uploadTransaction;
    private final SlidingWindowRateLimiter uploadsByMember;
    private final long pendingTotalMaxBytes;

    public RichBodyMediaService(RichBodyMediaRepository repository, MemberRepository members,
                                StorageService storage, MediaUploadValidator validator, Clock clock, RichBodyMediaDeleter deleter,
                                PlatformTransactionManager transactionManager,
                                @Value("${coms.media.pending-total-max-bytes:8589934592}") long pendingTotalMaxBytes,
                                @Value("${coms.media.uploads-per-10-minutes:60}") int uploadsPer10Minutes) {
        this.repository = repository; this.members = members; this.storage = storage;
        this.validator = validator; this.clock = clock; this.deleter = deleter;
        this.uploadTransaction = new TransactionTemplate(transactionManager);
        this.pendingTotalMaxBytes = pendingTotalMaxBytes;
        this.uploadsByMember = new SlidingWindowRateLimiter(uploadsPer10Minutes, Duration.ofMinutes(10), clock);
    }

    public static RichBodyMedia.Scope parseScope(String raw) {
        try { return RichBodyMedia.Scope.valueOf(raw.toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알 수 없는 업로드 범위입니다.");
        }
    }

    public RichBodyMedia upload(RichBodyMedia.Scope scope, RichBodyMedia.Kind kind, MultipartFile file, String studentId) {
        if (file == null || file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "파일을 선택해주세요.");
        var member = members.findByStudentId(studentId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!uploadsByMember.tryAcquire(studentId)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "업로드를 너무 자주 하고 있습니다. 잠시 후 다시 시도해 주세요.");
        }
        String type = switch (kind) {
            case IMAGE -> validator.validateImage(file);
            case VIDEO -> validator.validateVideo(file);
            case FILE -> validator.validateFile(file);
        };
        String original = MediaUploadValidator.cleanOriginalFilename(file).trim();
        if (original.isBlank() || original.length() > 255) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "올바른 파일 이름이 필요합니다.");
        }
        String extension = kind == RichBodyMedia.Kind.FILE
                ? org.springframework.util.StringUtils.getFilenameExtension(original).toLowerCase(Locale.ROOT)
                : MediaUploadValidator.canonicalExtension(type);
        if (kind != RichBodyMedia.Kind.FILE) {
            original = org.springframework.util.StringUtils.stripFilenameExtension(original) + "." + extension;
            if (original.length() > 255) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "파일 이름이 너무 깁니다.");
        }
        // Best-effort early rejection; the locked re-check below remains authoritative.
        checkPendingQuota(member.getId(), file.getSize());
        try {
            String stored = kind == RichBodyMedia.Kind.IMAGE ? storage.storeImage(file, type, extension) : storage.store(file, extension);
            RichBodyMedia media = new RichBodyMedia(kind, scope, stored, original, type, file.getSize(), member.getId(), LocalDateTime.now(clock));
            try {
                // Only quota check + insert hold the member lock shared with login/refresh.
                return uploadTransaction.execute(status -> {
                    members.findWithLockById(member.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
                    checkPendingQuota(member.getId(), file.getSize());
                    return repository.saveAndFlush(media);
                });
            } catch (RuntimeException e) {
                try {
                    storage.delete(stored);
                } catch (RuntimeException del) {
                    log.error("Could not delete rich media file {}", stored, del);
                    e.addSuppressed(del);
                }
                throw e;
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        }
    }

    private void checkPendingQuota(Long uploaderId, long sizeBytes) {
        // ponytail: the site-wide sum is only serialized per member, so concurrent uploads by different
        // members can overshoot by their own sizes; a global lock is not worth it for a soft cap.
        if (repository.sumAllPendingBytes() > pendingTotalMaxBytes - sizeBytes) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "사이트 전체 임시 업로드 용량이 가득 찼습니다. 잠시 후 다시 시도해 주세요.");
        }
        if (repository.countPending(uploaderId) >= MAX_PENDING_COUNT
                || repository.sumPendingBytes(uploaderId) > MAX_PENDING_BYTES - sizeBytes) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "저장하지 않은 업로드가 너무 많습니다. 글을 저장하거나 잠시 후 다시 시도해 주세요.");
        }
    }

    @Transactional(readOnly = true)
    public RichBodyMedia get(Long id, String studentId) {
        RichBodyMedia media = repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (media.getOwnerId() == null) {
            var reader = studentId == null ? null : members.findByStudentId(studentId).orElse(null);
            if (reader == null || (reader.getRole() != Member.Role.ADMIN
                    && !reader.getId().equals(media.getUploaderId()))) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            }
        } else if (media.getScope() != RichBodyMedia.Scope.SPONSOR && studentId == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return media;
    }

    public Resource load(RichBodyMedia media) { return storage.load(media.getStoredName()); }

    /** Create path: only the uploader may attach, including their own detached media. */
    @Transactional
    public void syncAttachments(RichBodyMedia.Scope scope, Long ownerId, String content, String actorStudentId) {
        syncAttachments(scope, ownerId, content, actorStudentId, false);
    }

    /**
     * @param actorMayEdit the caller already verified the actor may edit this scope/owner, so
     *                     media detached from an earlier save (24h grace) may be put back by them
     *                     even when someone else uploaded it. Never-attached pending media stays
     *                     uploader-only.
     */
    @Transactional
    public void syncAttachments(RichBodyMedia.Scope scope, Long ownerId, String content, String actorStudentId,
                                boolean actorMayEdit) {
        Map<Long, RichBodyMedia.Kind> references = parseReferences(content);
        Set<Long> referenced = references.keySet();
        var actor = actorStudentId == null || references.isEmpty() ? null
                : members.findByStudentId(actorStudentId).orElse(null);
        for (var reference : references.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList()) {
            RichBodyMedia row = repository.findLockedById(reference.getKey()).orElseThrow(RichBodyMediaService::invalidAttachment);
            if (row.getScope() != scope || row.getKind() != reference.getValue()) throw invalidAttachment();
            if (ownerId.equals(row.getOwnerId())) continue;
            boolean reattach = actorMayEdit && row.getDetachedAt() != null;
            if (row.getOwnerId() != null || actor == null || !(reattach || actor.getId().equals(row.getUploaderId()))) {
                throw invalidAttachment();
            }
            row.attach(ownerId, LocalDateTime.now(clock));
        }
        for (RichBodyMedia row : repository.findByScopeAndOwnerId(scope, ownerId).stream()
                .sorted(Comparator.comparing(RichBodyMedia::getId)).toList()) {
            if (!referenced.contains(row.getId())) row.detach(LocalDateTime.now(clock));
        }
    }

    /** Validate the whole body before taking any database locks. */
    private static Map<Long, RichBodyMedia.Kind> parseReferences(String content) {
        Map<Long, RichBodyMedia.Kind> references = new LinkedHashMap<>();
        Map<RichBodyMedia.Kind, Integer> counts = new EnumMap<>(RichBodyMedia.Kind.class);
        int mediaBlocks = 0;
        try {
            JsonNode blocks = JSON.readTree(content == null ? "" : content);
            if (blocks != null && blocks.isArray()) for (JsonNode block : blocks) {
                RichBodyMedia.Kind kind = switch (block.path("type").asText()) {
                    case "image" -> RichBodyMedia.Kind.IMAGE;
                    case "video" -> RichBodyMedia.Kind.VIDEO;
                    case "file" -> RichBodyMedia.Kind.FILE;
                    default -> null;
                };
                if (kind == null) continue;
                if (++mediaBlocks > MAX_BODY_MEDIA_BLOCKS) throw invalidAttachment();
                JsonNode idNode = block.path(kind == RichBodyMedia.Kind.FILE ? "fileId" : "mediaId");
                if (idNode.isMissingNode() || idNode.isNull()) continue; // Legacy URL-only blocks.
                if (!idNode.isIntegralNumber() || !idNode.canConvertToLong() || idNode.longValue() <= 0) {
                    throw invalidAttachment();
                }
                var previous = references.putIfAbsent(idNode.longValue(), kind);
                if (previous != null) {
                    if (previous != kind) throw invalidAttachment();
                    continue;
                }
                int limit = switch (kind) {
                    case IMAGE -> MAX_BODY_IMAGES;
                    case VIDEO -> MAX_BODY_VIDEOS;
                    case FILE -> MAX_BODY_FILES;
                };
                if (counts.merge(kind, 1, Integer::sum) > limit) throw invalidAttachment();
            }
        } catch (IOException ignored) {
            // Legacy plain text has no media references.
        }
        return references;
    }

    private static ResponseStatusException invalidAttachment() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "첨부할 수 없는 파일이 포함되어 있습니다. 다시 올려 주세요.");
    }

    @Transactional
    public void detachAttachments(RichBodyMedia.Scope scope, Long ownerId) {
        for (RichBodyMedia row : repository.findByScopeAndOwnerId(scope, ownerId)) row.detach(LocalDateTime.now(clock));
    }

    public int deleteOrphanedOlderThan(LocalDateTime cutoff) {
        int removed = 0;
        LocalDateTime detachedCutoff = LocalDateTime.now(clock).minusHours(24);
        for (RichBodyMedia candidate : repository.findOrphansOlderThan(cutoff, detachedCutoff)) {
            try {
                if (deleter.deleteIfStillOrphan(candidate.getId(), cutoff, detachedCutoff)) removed++;
            } catch (RuntimeException e) {
                log.warn("Could not purge orphan rich media {}", candidate.getId(), e);
            }
        }
        return removed;
    }
}
