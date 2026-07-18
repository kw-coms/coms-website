package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPostFile;
import com.coms.backend.domain.CommunityPostImage;
import com.coms.backend.domain.CommunityPostVideo;
import com.coms.backend.domain.DeletedCommunityPostAppeal;
import com.coms.backend.domain.DeletedCommunityPost;
import com.coms.backend.domain.DeletedCommunityPostComment;
import com.coms.backend.domain.DeletedCommunityPostImage;
import com.coms.backend.domain.DeletedCommunityPostMedia;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.DeletedCommunityPostAppealRequest;
import com.coms.backend.dto.DeletedCommunityPostAppealResponse;
import com.coms.backend.dto.DeletedCommunityPostResponse;
import com.coms.backend.dto.DeletedCommunityPostRestoreResponse;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.coms.backend.repository.DeletedCommunityPostCommentRepository;
import com.coms.backend.repository.DeletedCommunityPostAppealRepository;
import com.coms.backend.repository.DeletedCommunityPostImageRepository;
import com.coms.backend.repository.DeletedCommunityPostMediaRepository;
import com.coms.backend.repository.DeletedCommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class CommunityDeletionArchiveService {
    private static final int DEFAULT_RECENT_LIMIT = 300;
    private static final int MAX_RECENT_LIMIT = 1000;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final DeletedCommunityPostRepository repository;
    private final DeletedCommunityPostImageRepository deletedImageRepository;
    private final DeletedCommunityPostMediaRepository deletedMediaRepository;
    private final DeletedCommunityPostCommentRepository deletedCommentRepository;
    private final DeletedCommunityPostAppealRepository deletedAppealRepository;
    private final CommunityPostRepository communityPostRepository;
    private final CommunityPostImageRepository imageRepository;
    private final CommunityPostVideoRepository videoRepository;
    private final CommunityPostFileRepository fileRepository;
    private final CommunityCommentRepository commentRepository;
    private final MemberRepository memberRepository;
    private final StorageService storageService;
    private final AuditLogService auditLogService;
    private final NotificationService notificationService;

    public CommunityDeletionArchiveService(DeletedCommunityPostRepository repository,
                                           DeletedCommunityPostImageRepository deletedImageRepository,
                                           DeletedCommunityPostMediaRepository deletedMediaRepository,
                                           DeletedCommunityPostCommentRepository deletedCommentRepository,
                                           DeletedCommunityPostAppealRepository deletedAppealRepository,
                                           CommunityPostRepository communityPostRepository,
                                           CommunityPostImageRepository imageRepository,
                                           CommunityPostVideoRepository videoRepository,
                                           CommunityPostFileRepository fileRepository,
                                           CommunityCommentRepository commentRepository,
                                           MemberRepository memberRepository,
                                           StorageService storageService,
                                           AuditLogService auditLogService,
                                           NotificationService notificationService) {
        this.repository = repository;
        this.deletedImageRepository = deletedImageRepository;
        this.deletedMediaRepository = deletedMediaRepository;
        this.deletedCommentRepository = deletedCommentRepository;
        this.deletedAppealRepository = deletedAppealRepository;
        this.communityPostRepository = communityPostRepository;
        this.imageRepository = imageRepository;
        this.videoRepository = videoRepository;
        this.fileRepository = fileRepository;
        this.commentRepository = commentRepository;
        this.memberRepository = memberRepository;
        this.storageService = storageService;
        this.auditLogService = auditLogService;
        this.notificationService = notificationService;
    }

    public DeletedCommunityPost record(CommunityPost post, Member deletedBy, String reason) {
        DeletedCommunityPost snapshot = new DeletedCommunityPost();
        snapshot.setOriginalPostId(post.getId());
        snapshot.setTitle(post.getTitle());
        snapshot.setContent(post.getContent());
        snapshot.setAuthorStudentId(post.getAuthorStudentId());
        snapshot.setAuthorName(post.getAuthorName());
        snapshot.setCategory(post.getCategory().name());
        snapshot.setViewCount(post.getViewCount());
        snapshot.setOriginalCreatedAt(post.getCreatedAt());
        snapshot.setOriginalUpdatedAt(post.getUpdatedAt());
        snapshot.setDeletedByStudentId(deletedBy.getStudentId());
        snapshot.setDeletedByName(deletedBy.getName());
        snapshot.setDeletedByRole(deletedBy.getRole().name());
        snapshot.setDeletionReason(reason);
        DeletedCommunityPost saved = repository.save(snapshot);
        recordImages(saved, post);
        recordMedia(saved, post);
        recordComments(saved, post);
        return saved;
    }

    @Transactional(readOnly = true)
    public List<DeletedCommunityPostResponse> recent() {
        return recent(DEFAULT_RECENT_LIMIT);
    }

    @Transactional(readOnly = true)
    public List<DeletedCommunityPostResponse> recent(int limit) {
        return toResponses(repository.findAllByOrderByDeletedAtDesc(PageRequest.of(0, boundedLimit(limit))),
                "/api/admin/community/deleted-posts");
    }

    @Transactional(readOnly = true)
    public DeletedCommunityPostResponse detail(Long deletedPostId) {
        DeletedCommunityPost snapshot = repository.findById(deletedPostId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return toResponse(snapshot, "/api/admin/community/deleted-posts",
                latestAppeals(List.of(snapshot.getId())).get(snapshot.getId()));
    }

    @Transactional(readOnly = true)
    public List<DeletedCommunityPostResponse> mine(String studentId) {
        return toResponses(repository.findByAuthorStudentIdOrderByDeletedAtDesc(studentId),
                "/api/community/posts/deleted");
    }

    @Transactional
    public DeletedCommunityPostAppealResponse requestRestore(Long deletedPostId,
                                                             String requesterStudentId,
                                                             DeletedCommunityPostAppealRequest request) {
        Member requester = memberRepository.findByStudentId(requesterStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        DeletedCommunityPost snapshot = repository.findById(deletedPostId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!snapshot.getAuthorStudentId().equals(requester.getStudentId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (snapshot.getRestoredPostId() != null || snapshot.getRestoredAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 복원된 게시글입니다.");
        }
        String message = normalizeAppealMessage(request == null ? null : request.message());
        if (deletedAppealRepository.existsByDeletedPostIdAndRequesterStudentIdAndStatus(
                snapshot.getId(), requester.getStudentId(), DeletedCommunityPostAppeal.Status.OPEN)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 열린 복원 요청이 있습니다.");
        }
        DeletedCommunityPostAppeal appeal = new DeletedCommunityPostAppeal();
        appeal.setDeletedPostId(snapshot.getId());
        appeal.setRequesterStudentId(requester.getStudentId());
        appeal.setRequesterName(requester.getName());
        appeal.setMessage(message);
        DeletedCommunityPostAppeal saved = deletedAppealRepository.save(appeal);
        auditLogService.record(requester.getStudentId(), "COMMUNITY_POST_RESTORE_REQUEST", "DELETED_COMMUNITY_POST",
                String.valueOf(snapshot.getId()),
                String.join("\n",
                        "originalPostId=" + snapshot.getOriginalPostId(),
                        "title=" + snapshot.getTitle(),
                        "deletedBy=" + snapshot.getDeletedByName() + "(" + snapshot.getDeletedByStudentId() + ")",
                        "message=" + message
                ),
                null);
        return toAppealResponse(saved);
    }

    @Transactional(readOnly = true)
    public Set<String> archivedStoredNames(Long deletedPostId) {
        Set<String> names = deletedImageRepository.findByDeletedPostIdOrderByPositionAsc(deletedPostId).stream()
                .map(DeletedCommunityPostImage::getStoredName)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        deletedMediaRepository.findByDeletedPostIdOrderByPositionAsc(deletedPostId).stream()
                .map(DeletedCommunityPostMedia::getStoredName)
                .forEach(names::add);
        return names;
    }

    @Transactional(readOnly = true)
    public boolean isArchivedStoredName(String storedName) {
        return storedName != null && !storedName.isBlank()
                && (deletedImageRepository.existsByStoredName(storedName)
                || deletedMediaRepository.existsByStoredName(storedName));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public DeletedCommunityPostImage loadImageMeta(Long deletedPostId, Long imageId) {
        return deletedImageRepository.findById(imageId)
                .filter(image -> image.getDeletedPostId().equals(deletedPostId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public DeletedCommunityPostImage loadOwnImageMeta(Long deletedPostId, Long imageId, String studentId) {
        requireAuthor(deletedPostId, studentId);
        return loadImageMeta(deletedPostId, imageId);
    }

    @Transactional(readOnly = true)
    public Resource loadOwnImage(Long deletedPostId, Long imageId, String studentId) {
        loadOwnImageMeta(deletedPostId, imageId, studentId);
        return loadImage(deletedPostId, imageId);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public Resource loadImage(Long deletedPostId, Long imageId) {
        DeletedCommunityPostImage image = loadImageMeta(deletedPostId, imageId);
        return storageService.load(image.getStoredName());
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public DeletedCommunityPostMedia loadMediaMeta(Long deletedPostId, Long mediaId) {
        return deletedMediaRepository.findById(mediaId)
                .filter(media -> media.getDeletedPostId().equals(deletedPostId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public DeletedCommunityPostMedia loadOwnMediaMeta(Long deletedPostId, Long mediaId, String studentId) {
        requireAuthor(deletedPostId, studentId);
        return loadMediaMeta(deletedPostId, mediaId);
    }

    @Transactional(readOnly = true)
    public Resource loadOwnMedia(Long deletedPostId, Long mediaId, String studentId) {
        loadOwnMediaMeta(deletedPostId, mediaId, studentId);
        return loadMedia(deletedPostId, mediaId);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public Resource loadMedia(Long deletedPostId, Long mediaId) {
        DeletedCommunityPostMedia media = loadMediaMeta(deletedPostId, mediaId);
        return storageService.load(media.getStoredName());
    }

    @Transactional
    public DeletedCommunityPostRestoreResponse restore(Long deletedPostId, String adminStudentId) {
        Member admin = memberRepository.findByStudentId(adminStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (admin.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        DeletedCommunityPost snapshot = repository.findById(deletedPostId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (snapshot.getRestoredAt() != null || snapshot.getRestoredPostId() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 복원된 게시글입니다.");
        }

        List<DeletedCommunityPostImage> archivedImages = deletedImageRepository.findByDeletedPostIdOrderByPositionAsc(snapshot.getId());
        List<DeletedCommunityPostMedia> archivedMedia = deletedMediaRepository.findByDeletedPostIdOrderByPositionAsc(snapshot.getId());
        List<DeletedCommunityPostComment> archivedComments = deletedCommentRepository.findByDeletedPostIdOrderByDepthAscCreatedAtAsc(snapshot.getId());
        CommunityPost restored = new CommunityPost();
        restored.setTitle(snapshot.getTitle());
        restored.setContent(snapshot.getContent());
        restored.setAuthorStudentId(snapshot.getAuthorStudentId());
        restored.setAuthorName(snapshot.getAuthorName());
        restored.setCategory(parseCategory(snapshot.getCategory()));
        restored.setViewCount(snapshot.getViewCount());
        restored.setCreatedAt(snapshot.getOriginalCreatedAt());
        restored.setUpdatedAt(snapshot.getOriginalUpdatedAt());
        restored.setEdited(!snapshot.getOriginalCreatedAt().equals(snapshot.getOriginalUpdatedAt()));
        archivedImages.stream()
                .filter(image -> DeletedCommunityPostImage.KIND_COVER.equals(image.getKind()))
                .findFirst()
                .ifPresent(image -> {
                    restored.setImageStoredName(image.getStoredName());
                    restored.setImageOriginalName(image.getOriginalName());
                    restored.setImageMimeType(image.getMimeType());
                });
        CommunityPost savedPost = communityPostRepository.save(restored);

        Map<Long, Long> imageIdMap = new HashMap<>();
        for (DeletedCommunityPostImage archivedImage : archivedImages) {
            if (!DeletedCommunityPostImage.KIND_INLINE.equals(archivedImage.getKind())) {
                continue;
            }
            CommunityPostImage savedImage = imageRepository.save(new CommunityPostImage(
                    savedPost.getId(),
                    archivedImage.getStoredName(),
                    archivedImage.getOriginalName(),
                    archivedImage.getMimeType(),
                    archivedImage.getPosition()
            ));
            if (archivedImage.getOriginalImageId() != null) {
                imageIdMap.put(archivedImage.getOriginalImageId(), savedImage.getId());
            }
        }
        Map<Long, Long> videoIdMap = new HashMap<>();
        Map<Long, Long> fileIdMap = new HashMap<>();
        for (DeletedCommunityPostMedia archived : archivedMedia) {
            if (DeletedCommunityPostMedia.KIND_VIDEO.equals(archived.getKind())) {
                CommunityPostVideo savedVideo = videoRepository.save(new CommunityPostVideo(
                        savedPost.getId(),
                        archived.getStoredName(),
                        archived.getOriginalName(),
                        archived.getMimeType(),
                        archived.getPosition()
                ));
                videoIdMap.put(archived.getOriginalMediaId(), savedVideo.getId());
            } else if (DeletedCommunityPostMedia.KIND_FILE.equals(archived.getKind())) {
                CommunityPostFile savedFile = fileRepository.save(new CommunityPostFile(
                        savedPost.getId(),
                        archived.getStoredName(),
                        archived.getOriginalName(),
                        archived.getMimeType(),
                        archived.getPosition()
                ));
                fileIdMap.put(archived.getOriginalMediaId(), savedFile.getId());
            }
        }
        if (!imageIdMap.isEmpty() || !videoIdMap.isEmpty() || !fileIdMap.isEmpty()) {
            savedPost.setContent(rewriteMediaIds(snapshot.getContent(), imageIdMap, videoIdMap, fileIdMap));
            savedPost = communityPostRepository.save(savedPost);
        }
        restoreComments(savedPost.getId(), archivedComments);

        snapshot.setRestoredPostId(savedPost.getId());
        snapshot.setRestoredByStudentId(admin.getStudentId());
        snapshot.setRestoredByName(admin.getName());
        snapshot.setRestoredAt(LocalDateTime.now());
        repository.save(snapshot);
        auditLogService.record(admin.getStudentId(), "COMMUNITY_POST_RESTORE", "COMMUNITY_POST", String.valueOf(savedPost.getId()),
                String.join("\n",
                        "deletedSnapshotId=" + snapshot.getId(),
                        "originalPostId=" + snapshot.getOriginalPostId(),
                        "title=" + snapshot.getTitle(),
                        "author=" + snapshot.getAuthorName() + "(" + snapshot.getAuthorStudentId() + ")"
                ),
                null);
        notificationService.notifyPostRestored(savedPost, admin.getStudentId(), admin.getName());
        return new DeletedCommunityPostRestoreResponse(savedPost.getId());
    }

    private int boundedLimit(int limit) {
        if (limit < 1) {
            return 1;
        }
        return Math.min(limit, MAX_RECENT_LIMIT);
    }

    private void recordImages(DeletedCommunityPost snapshot, CommunityPost post) {
        int position = 0;
        if (post.getImageStoredName() != null) {
            deletedImageRepository.save(new DeletedCommunityPostImage(
                    snapshot.getId(),
                    null,
                    DeletedCommunityPostImage.KIND_COVER,
                    post.getImageStoredName(),
                    post.getImageOriginalName(),
                    post.getImageMimeType(),
                    position++
            ));
        }
        List<CommunityPostImage> images = imageRepository.findByPostIdOrderByPositionAsc(post.getId());
        for (CommunityPostImage image : images) {
            deletedImageRepository.save(new DeletedCommunityPostImage(
                    snapshot.getId(),
                    image.getId(),
                    DeletedCommunityPostImage.KIND_INLINE,
                    image.getStoredName(),
                    image.getOriginalName(),
                    image.getMimeType(),
                    position++
            ));
        }
    }

    private void recordMedia(DeletedCommunityPost snapshot, CommunityPost post) {
        List<CommunityPostVideo> videos = videoRepository.findByPostIdOrderByPositionAsc(post.getId());
        for (CommunityPostVideo video : videos) {
            deletedMediaRepository.save(new DeletedCommunityPostMedia(
                    snapshot.getId(),
                    video.getId(),
                    DeletedCommunityPostMedia.KIND_VIDEO,
                    video.getStoredName(),
                    video.getOriginalName(),
                    video.getMimeType(),
                    video.getPosition()
            ));
        }
        List<CommunityPostFile> files = fileRepository.findByPostIdOrderByPositionAsc(post.getId());
        for (CommunityPostFile file : files) {
            deletedMediaRepository.save(new DeletedCommunityPostMedia(
                    snapshot.getId(),
                    file.getId(),
                    DeletedCommunityPostMedia.KIND_FILE,
                    file.getStoredName(),
                    file.getOriginalName(),
                    file.getMimeType(),
                    file.getPosition()
            ));
        }
    }

    private void recordComments(DeletedCommunityPost snapshot, CommunityPost post) {
        for (CommunityComment comment : commentRepository.findByPostIdOrderByCreatedAtAsc(post.getId())) {
            deletedCommentRepository.save(new DeletedCommunityPostComment(
                    snapshot.getId(),
                    comment.getId(),
                    comment.getParentCommentId(),
                    comment.getStudentId(),
                    comment.getAuthorName(),
                    comment.getAnonymousName(),
                    comment.getIpAddress(),
                    comment.getContent(),
                    comment.getDepth(),
                    comment.getCreatedAt(),
                    comment.getUpdatedAt(),
                    comment.isEdited()
            ));
        }
    }

    private List<DeletedCommunityPostResponse> toResponses(List<DeletedCommunityPost> snapshots, String mediaBasePath) {
        Map<Long, DeletedCommunityPostAppeal> latestAppeals = latestAppeals(snapshots.stream().map(DeletedCommunityPost::getId).toList());
        return snapshots.stream()
                .map(snapshot -> toResponse(snapshot, mediaBasePath, latestAppeals.get(snapshot.getId())))
                .toList();
    }

    private DeletedCommunityPostResponse toResponse(DeletedCommunityPost snapshot,
                                                    String mediaBasePath,
                                                    DeletedCommunityPostAppeal latestAppeal) {
        List<DeletedCommunityPostResponse.ImageInfo> imageInfos = deletedImageRepository.findByDeletedPostIdOrderByPositionAsc(snapshot.getId()).stream()
                .map(image -> new DeletedCommunityPostResponse.ImageInfo(
                        image.getId(),
                        image.getOriginalImageId(),
                        image.getKind(),
                        mediaBasePath + "/" + snapshot.getId() + "/images/" + image.getId(),
                        image.getOriginalName()
                ))
                .toList();
        List<DeletedCommunityPostResponse.MediaInfo> videoInfos = deletedMediaRepository.findByDeletedPostIdOrderByPositionAsc(snapshot.getId()).stream()
                .filter(media -> DeletedCommunityPostMedia.KIND_VIDEO.equals(media.getKind()))
                .map(media -> new DeletedCommunityPostResponse.MediaInfo(
                        media.getId(),
                        media.getOriginalMediaId(),
                        media.getKind(),
                        mediaBasePath + "/" + snapshot.getId() + "/media/" + media.getId(),
                        media.getOriginalName()
                ))
                .toList();
        List<DeletedCommunityPostResponse.MediaInfo> fileInfos = deletedMediaRepository.findByDeletedPostIdOrderByPositionAsc(snapshot.getId()).stream()
                .filter(media -> DeletedCommunityPostMedia.KIND_FILE.equals(media.getKind()))
                .map(media -> new DeletedCommunityPostResponse.MediaInfo(
                        media.getId(),
                        media.getOriginalMediaId(),
                        media.getKind(),
                        mediaBasePath + "/" + snapshot.getId() + "/media/" + media.getId(),
                        media.getOriginalName()
                ))
                .toList();
        List<DeletedCommunityPostComment> comments = deletedCommentRepository.findByDeletedPostIdOrderByDepthAscCreatedAtAsc(snapshot.getId());
        List<DeletedCommunityPostResponse.CommentInfo> commentInfos = comments.stream()
                .map(comment -> new DeletedCommunityPostResponse.CommentInfo(
                        comment.getOriginalCommentId(),
                        comment.getOriginalParentCommentId(),
                        comment.getStudentId(),
                        comment.getAuthorName(),
                        comment.getAnonymousName(),
                        comment.getDepth(),
                        comment.getContent(),
                        comment.getCreatedAt(),
                        comment.isEdited()
                ))
                .toList();
        return new DeletedCommunityPostResponse(
                snapshot.getId(),
                snapshot.getOriginalPostId(),
                snapshot.getTitle(),
                snapshot.getContent(),
                snapshot.getAuthorStudentId(),
                snapshot.getAuthorName(),
                snapshot.getCategory(),
                snapshot.getViewCount(),
                snapshot.getOriginalCreatedAt(),
                snapshot.getOriginalUpdatedAt(),
                snapshot.getDeletedByStudentId(),
                snapshot.getDeletedByName(),
                snapshot.getDeletedByRole(),
                snapshot.getDeletionReason(),
                snapshot.getDeletedAt(),
                imageInfos,
                videoInfos,
                fileInfos,
                comments.size(),
                commentInfos,
                snapshot.getRestoredPostId(),
                snapshot.getRestoredByStudentId(),
                snapshot.getRestoredByName(),
                snapshot.getRestoredAt(),
                latestAppeal == null ? null : latestAppeal.getStatus().name(),
                latestAppeal == null ? null : latestAppeal.getRequesterStudentId(),
                latestAppeal == null ? null : latestAppeal.getRequesterName(),
                latestAppeal == null ? null : latestAppeal.getMessage(),
                latestAppeal == null ? null : latestAppeal.getCreatedAt(),
                latestAppeal == null ? null : latestAppeal.getResolutionNote(),
                latestAppeal == null ? null : latestAppeal.getResolvedAt()
        );
    }

    private Map<Long, DeletedCommunityPostAppeal> latestAppeals(Collection<Long> deletedPostIds) {
        if (deletedPostIds == null || deletedPostIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, DeletedCommunityPostAppeal> latest = new HashMap<>();
        for (DeletedCommunityPostAppeal appeal : deletedAppealRepository.findByDeletedPostIdInOrderByCreatedAtDesc(deletedPostIds)) {
            latest.putIfAbsent(appeal.getDeletedPostId(), appeal);
        }
        return latest;
    }

    private DeletedCommunityPost requireAuthor(Long deletedPostId, String studentId) {
        DeletedCommunityPost snapshot = repository.findById(deletedPostId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!snapshot.getAuthorStudentId().equals(studentId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return snapshot;
    }

    private String normalizeAppealMessage(String value) {
        String normalized = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "복원 요청 사유를 입력해주세요.");
        }
        if (normalized.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "복원 요청 사유는 500자 이하로 입력해주세요.");
        }
        return normalized;
    }

    private DeletedCommunityPostAppealResponse toAppealResponse(DeletedCommunityPostAppeal appeal) {
        return new DeletedCommunityPostAppealResponse(
                appeal.getId(),
                appeal.getDeletedPostId(),
                appeal.getRequesterStudentId(),
                appeal.getRequesterName(),
                appeal.getMessage(),
                appeal.getStatus().name(),
                appeal.getCreatedAt(),
                appeal.getResolvedAt(),
                appeal.getResolutionNote()
        );
    }

    private CommunityPost.Category parseCategory(String category) {
        if (category == null || category.isBlank()) {
            return CommunityPost.Category.GENERAL;
        }
        try {
            return CommunityPost.Category.valueOf(category);
        } catch (IllegalArgumentException ignored) {
            return CommunityPost.Category.GENERAL;
        }
    }

    private void restoreComments(Long restoredPostId, List<DeletedCommunityPostComment> archivedComments) {
        Map<Long, Long> restoredCommentIds = new HashMap<>();
        for (DeletedCommunityPostComment archived : archivedComments) {
            Long parentCommentId = archived.getOriginalParentCommentId() == null
                    ? null
                    : restoredCommentIds.get(archived.getOriginalParentCommentId());
            CommunityComment restored = new CommunityComment(
                    restoredPostId,
                    archived.getStudentId(),
                    archived.getAuthorName(),
                    archived.getContent(),
                    parentCommentId,
                    archived.getDepth()
            );
            restored.setAnonymousName(archived.getAnonymousName());
            restored.setIpAddress(archived.getIpAddress());
            restored.setCreatedAt(archived.getCreatedAt());
            restored.setUpdatedAt(archived.getUpdatedAt());
            restored.setEdited(archived.isEdited());
            CommunityComment saved = commentRepository.save(restored);
            restoredCommentIds.put(archived.getOriginalCommentId(), saved.getId());
        }
    }

    private String rewriteMediaIds(String content,
                                   Map<Long, Long> imageIdMap,
                                   Map<Long, Long> videoIdMap,
                                   Map<Long, Long> fileIdMap) {
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) {
                return content;
            }
            ArrayNode next = JSON.createArrayNode();
            for (JsonNode block : root) {
                if (block.isObject()) {
                    String type = block.path("type").asText();
                    String idField = "file".equals(type) ? "fileId" : "mediaId";
                    Map<Long, Long> idMap = switch (type) {
                        case "image" -> imageIdMap;
                        case "video" -> videoIdMap;
                        case "file" -> fileIdMap;
                        default -> Map.of();
                    };
                    if (!idMap.isEmpty() && block.path(idField).canConvertToLong()) {
                        Long nextId = idMap.get(block.path(idField).asLong());
                        if (nextId != null) {
                            ObjectNode copy = ((ObjectNode) block).deepCopy();
                            copy.put(idField, nextId);
                            next.add(copy);
                            continue;
                        }
                    }
                }
                next.add(block);
            }
            return JSON.writeValueAsString(next);
        } catch (Exception ignored) {
            return content;
        }
    }
}
