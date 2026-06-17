package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostImage;
import com.coms.backend.domain.DeletedCommunityPost;
import com.coms.backend.domain.DeletedCommunityPostImage;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.DeletedCommunityPostResponse;
import com.coms.backend.dto.DeletedCommunityPostRestoreResponse;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.DeletedCommunityPostImageRepository;
import com.coms.backend.repository.DeletedCommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.HashMap;
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
    private final CommunityPostRepository communityPostRepository;
    private final CommunityPostImageRepository imageRepository;
    private final MemberRepository memberRepository;
    private final StorageService storageService;
    private final AuditLogService auditLogService;

    public CommunityDeletionArchiveService(DeletedCommunityPostRepository repository,
                                           DeletedCommunityPostImageRepository deletedImageRepository,
                                           CommunityPostRepository communityPostRepository,
                                           CommunityPostImageRepository imageRepository,
                                           MemberRepository memberRepository,
                                           StorageService storageService,
                                           AuditLogService auditLogService) {
        this.repository = repository;
        this.deletedImageRepository = deletedImageRepository;
        this.communityPostRepository = communityPostRepository;
        this.imageRepository = imageRepository;
        this.memberRepository = memberRepository;
        this.storageService = storageService;
        this.auditLogService = auditLogService;
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
        return saved;
    }

    @Transactional(readOnly = true)
    public List<DeletedCommunityPostResponse> recent() {
        return recent(DEFAULT_RECENT_LIMIT);
    }

    @Transactional(readOnly = true)
    public List<DeletedCommunityPostResponse> recent(int limit) {
        return repository.findAllByOrderByDeletedAtDesc(PageRequest.of(0, boundedLimit(limit))).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public Set<String> archivedStoredNames(Long deletedPostId) {
        return deletedImageRepository.findByDeletedPostIdOrderByPositionAsc(deletedPostId).stream()
                .map(DeletedCommunityPostImage::getStoredName)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    @Transactional(readOnly = true)
    public boolean isArchivedStoredName(String storedName) {
        return storedName != null && !storedName.isBlank() && deletedImageRepository.existsByStoredName(storedName);
    }

    @Transactional(readOnly = true)
    public DeletedCommunityPostImage loadImageMeta(Long deletedPostId, Long imageId) {
        return deletedImageRepository.findById(imageId)
                .filter(image -> image.getDeletedPostId().equals(deletedPostId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public Resource loadImage(Long deletedPostId, Long imageId) {
        DeletedCommunityPostImage image = loadImageMeta(deletedPostId, imageId);
        return storageService.load(image.getStoredName());
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

        Map<Long, Long> mediaIdMap = new HashMap<>();
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
                mediaIdMap.put(archivedImage.getOriginalImageId(), savedImage.getId());
            }
        }
        if (!mediaIdMap.isEmpty()) {
            savedPost.setContent(rewriteImageMediaIds(snapshot.getContent(), mediaIdMap));
            savedPost = communityPostRepository.save(savedPost);
        }

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

    private DeletedCommunityPostResponse toResponse(DeletedCommunityPost snapshot) {
        List<DeletedCommunityPostResponse.ImageInfo> imageInfos = deletedImageRepository.findByDeletedPostIdOrderByPositionAsc(snapshot.getId()).stream()
                .map(image -> new DeletedCommunityPostResponse.ImageInfo(
                        image.getId(),
                        image.getOriginalImageId(),
                        image.getKind(),
                        "/api/admin/community/deleted-posts/" + snapshot.getId() + "/images/" + image.getId(),
                        image.getOriginalName()
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
                snapshot.getRestoredPostId(),
                snapshot.getRestoredByStudentId(),
                snapshot.getRestoredByName(),
                snapshot.getRestoredAt()
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

    private String rewriteImageMediaIds(String content, Map<Long, Long> mediaIdMap) {
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) {
                return content;
            }
            ArrayNode next = JSON.createArrayNode();
            for (JsonNode block : root) {
                if (block.isObject()
                        && "image".equals(block.path("type").asText())
                        && block.path("mediaId").canConvertToLong()) {
                    Long nextId = mediaIdMap.get(block.path("mediaId").asLong());
                    if (nextId != null) {
                        ObjectNode copy = ((ObjectNode) block).deepCopy();
                        copy.put("mediaId", nextId);
                        next.add(copy);
                        continue;
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
