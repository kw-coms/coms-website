package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostFile;
import com.coms.backend.domain.CommunityPostImage;
import com.coms.backend.domain.CommunityPostVideo;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Owns community post media: the cover image plus the extra image/video/file attachments — their
 * upload validation, storage, per-post and batched lookups, and the "which image represents this
 * post when shared" selection. Storage deletions honour the deletion archive so evidence stays
 * readable after a post is removed.
 */
@Service
@Transactional
class CommunityMediaService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 100L * 1024 * 1024;
    private static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
    private static final int MAX_EXTRA_IMAGES_PER_POST = 5;
    private static final int MAX_VIDEOS_PER_POST = 3;
    private static final int MAX_FILES_PER_POST = 5;
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");
    private static final Set<String> ALLOWED_VIDEO_TYPES = Set.of("video/mp4", "video/webm", "video/quicktime");
    private static final Set<String> ALLOWED_FILE_TYPES = Set.of(
            "application/zip",
            "application/x-zip-compressed",
            "application/octet-stream"
    );

    private final CommunityPostRepository communityPostRepository;
    private final CommunityPostImageRepository imageRepository;
    private final CommunityPostFileRepository fileRepository;
    private final CommunityPostVideoRepository videoRepository;
    private final StorageService storageService;
    private final CommunityDeletionArchiveService deletionArchiveService;
    private final CommunityAccess access;

    CommunityMediaService(CommunityPostRepository communityPostRepository,
                          CommunityPostImageRepository imageRepository,
                          CommunityPostFileRepository fileRepository,
                          CommunityPostVideoRepository videoRepository,
                          StorageService storageService,
                          CommunityDeletionArchiveService deletionArchiveService,
                          CommunityAccess access) {
        this.communityPostRepository = communityPostRepository;
        this.imageRepository = imageRepository;
        this.fileRepository = fileRepository;
        this.videoRepository = videoRepository;
        this.storageService = storageService;
        this.deletionArchiveService = deletionArchiveService;
        this.access = access;
    }

    // ---- Extra image attachments -------------------------------------------------------------

    public List<Long> addImages(String studentId, Long postId, List<MultipartFile> images) {
        if (images == null || images.isEmpty()) return List.of();
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireOwnerOrAdmin(post, member);
        List<CommunityPostImage> existing = imageRepository.findByPostIdOrderByPositionAsc(postId);
        long uploadCount = images.stream().filter(image -> image != null && !image.isEmpty()).count();
        if (existing.size() + uploadCount > MAX_EXTRA_IMAGES_PER_POST) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "게시글 이미지는 최대 5개까지 업로드할 수 있습니다.");
        }
        int startPos = existing.size();
        List<Long> createdIds = new java.util.ArrayList<>();
        for (int i = 0; i < images.size(); i++) {
            MultipartFile image = images.get(i);
            if (image == null || image.isEmpty()) continue;
            String contentType = image.getContentType() == null ? "" : image.getContentType();
            if (!ALLOWED_IMAGE_TYPES.contains(contentType)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JPG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.");
            }
            if (image.getSize() > MAX_IMAGE_BYTES) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지는 5MB 이하만 업로드할 수 있습니다.");
            }
            try {
                String stored = storageService.storeImage(image, contentType);
                CommunityPostImage saved = imageRepository.save(new CommunityPostImage(postId, stored, image.getOriginalFilename(), contentType, startPos + i));
                createdIds.add(saved.getId());
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
            }
        }
        return createdIds;
    }

    public void deleteImage(String studentId, Long postId, Long imageId) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireOwnerOrAdmin(post, member);
        CommunityPostImage img = imageRepository.findById(imageId)
                .filter(i -> i.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        deleteStoredFile(img.getStoredName(), Set.of());
        imageRepository.delete(img);
    }

    public Resource loadExtraImage(Long postId, Long imageId) {
        CommunityPostImage img = loadExtraImageMeta(postId, imageId);
        return storageService.load(img.getStoredName());
    }

    public CommunityPostImage loadExtraImageMeta(Long postId, Long imageId) {
        return imageRepository.findById(imageId)
                .filter(i -> i.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    public String getExtraImageMimeType(Long postId, Long imageId) {
        return loadExtraImageMeta(postId, imageId).getMimeType();
    }

    // ---- Video attachments -------------------------------------------------------------------

    public Long addVideo(String studentId, Long postId, MultipartFile video) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireOwnerOrAdmin(post, member);
        if (video == null || video.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "영상 파일을 선택해주세요.");
        }
        String contentType = video.getContentType() == null ? "" : video.getContentType();
        if (!ALLOWED_VIDEO_TYPES.contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "MP4, WebM, MOV 영상만 업로드할 수 있습니다.");
        }
        if (video.getSize() > MAX_VIDEO_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "영상은 100MB 이하만 업로드할 수 있습니다.");
        }
        long existing = videoRepository.findByPostIdOrderByPositionAsc(postId).size();
        if (existing >= MAX_VIDEOS_PER_POST) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "게시글 영상은 최대 3개까지 업로드할 수 있습니다.");
        }
        try {
            String stored = storageService.store(video);
            CommunityPostVideo saved = videoRepository.save(
                    new CommunityPostVideo(postId, stored, video.getOriginalFilename(), contentType, (int) existing));
            return saved.getId();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "영상 저장에 실패했습니다.");
        }
    }

    public void deleteVideo(String studentId, Long postId, Long videoId) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireOwnerOrAdmin(post, member);
        CommunityPostVideo vid = videoRepository.findById(videoId)
                .filter(v -> v.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        deleteStoredFile(vid.getStoredName(), Set.of());
        videoRepository.delete(vid);
    }

    public CommunityPostVideo loadVideoMeta(Long postId, Long videoId) {
        return videoRepository.findById(videoId)
                .filter(v -> v.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    public Resource loadVideo(Long postId, Long videoId) {
        CommunityPostVideo vid = loadVideoMeta(postId, videoId);
        return storageService.load(vid.getStoredName());
    }

    // ---- File attachments --------------------------------------------------------------------

    public Long addFile(String studentId, Long postId, MultipartFile file) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireOwnerOrAdmin(post, member);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "첨부파일을 선택해주세요.");
        }
        String originalName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String contentType = file.getContentType() == null ? "" : file.getContentType();
        if (!isAllowedArchiveFile(originalName, contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ZIP 압축파일만 업로드할 수 있습니다.");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "첨부파일은 50MB 이하만 업로드할 수 있습니다.");
        }
        long existing = fileRepository.findByPostIdOrderByPositionAsc(postId).size();
        if (existing >= MAX_FILES_PER_POST) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "첨부파일은 최대 5개까지 업로드할 수 있습니다.");
        }
        try {
            String stored = storageService.store(file);
            CommunityPostFile saved = fileRepository.save(
                    new CommunityPostFile(postId, stored, originalName, normalizeArchiveMime(contentType), (int) existing));
            return saved.getId();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "첨부파일 저장에 실패했습니다.");
        }
    }

    public CommunityPostFile loadFileMeta(Long postId, Long fileId) {
        return fileRepository.findById(fileId)
                .filter(file -> file.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    public Resource loadFile(Long postId, Long fileId) {
        CommunityPostFile file = loadFileMeta(postId, fileId);
        return storageService.load(file.getStoredName());
    }

    // ---- Cover image on the post entity ------------------------------------------------------

    void attachImage(CommunityPost post, MultipartFile image) {
        if (image == null || image.isEmpty()) {
            return;
        }
        String contentType = image.getContentType() == null ? "" : image.getContentType();
        if (!ALLOWED_IMAGE_TYPES.contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JPG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.");
        }
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지는 5MB 이하만 업로드할 수 있습니다.");
        }
        clearImage(post);
        try {
            post.setImageStoredName(storageService.storeImage(image, contentType));
            post.setImageOriginalName(image.getOriginalFilename());
            post.setImageMimeType(contentType);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
        }
    }

    void clearImage(CommunityPost post) {
        clearImage(post, Set.of());
    }

    void clearImage(CommunityPost post, Set<String> preservedStoredNames) {
        if (post.getImageStoredName() != null) {
            deleteStoredFile(post.getImageStoredName(), preservedStoredNames);
        }
        post.setImageStoredName(null);
        post.setImageOriginalName(null);
        post.setImageMimeType(null);
    }

    void clearExtraMedia(Long postId, Set<String> preservedStoredNames) {
        List<CommunityPostImage> images = imageRepository.findByPostIdOrderByPositionAsc(postId);
        images.forEach(image -> deleteStoredFile(image.getStoredName(), preservedStoredNames));
        imageRepository.deleteByPostId(postId);
        List<CommunityPostVideo> videos = videoRepository.findByPostIdOrderByPositionAsc(postId);
        videos.forEach(video -> deleteStoredFile(video.getStoredName(), preservedStoredNames));
        videoRepository.deleteByPostId(postId);
        List<CommunityPostFile> files = fileRepository.findByPostIdOrderByPositionAsc(postId);
        files.forEach(file -> deleteStoredFile(file.getStoredName(), preservedStoredNames));
        fileRepository.deleteByPostId(postId);
    }

    // ---- Per-post and batched lookups used by response assembly ------------------------------

    List<CommunityPostImage> imagesForPost(Long postId) {
        return imageRepository.findByPostIdOrderByPositionAsc(postId);
    }

    List<CommunityPostVideo> videosForPost(Long postId) {
        return videoRepository.findByPostIdOrderByPositionAsc(postId);
    }

    List<CommunityPostFile> filesForPost(Long postId) {
        return fileRepository.findByPostIdOrderByPositionAsc(postId);
    }

    Map<Long, List<CommunityPostImage>> imagesByPost(List<CommunityPost> posts) {
        List<Long> postIds = postIds(posts);
        if (postIds.isEmpty()) {
            return Map.of();
        }
        return imageRepository.findByPostIdInOrderByPositionAsc(postIds).stream()
                .collect(Collectors.groupingBy(CommunityPostImage::getPostId));
    }

    Map<Long, List<CommunityPostVideo>> videosByPost(List<CommunityPost> posts) {
        List<Long> postIds = postIds(posts);
        if (postIds.isEmpty()) {
            return Map.of();
        }
        return videoRepository.findByPostIdInOrderByPositionAsc(postIds).stream()
                .collect(Collectors.groupingBy(CommunityPostVideo::getPostId));
    }

    Map<Long, List<CommunityPostFile>> filesByPost(List<CommunityPost> posts) {
        List<Long> postIds = postIds(posts);
        if (postIds.isEmpty()) {
            return Map.of();
        }
        return fileRepository.findByPostIdInOrderByPositionAsc(postIds).stream()
                .collect(Collectors.groupingBy(CommunityPostFile::getPostId));
    }

    // ---- Share image selection ---------------------------------------------------------------

    boolean hasShareImage(CommunityPost post) {
        return firstShareImage(post).isPresent() || post.getImageStoredName() != null;
    }

    Optional<CommunityPostImage> firstShareImage(CommunityPost post) {
        List<CommunityPostImage> images = imageRepository.findByPostIdOrderByPositionAsc(post.getId());
        return firstContentImage(post.getContent(), images).or(images.stream()::findFirst);
    }

    private Optional<CommunityPostImage> firstContentImage(String content, List<CommunityPostImage> images) {
        if (content == null || content.isBlank() || images.isEmpty()) {
            return Optional.empty();
        }
        Map<Long, CommunityPostImage> imagesById = images.stream()
                .collect(Collectors.toMap(CommunityPostImage::getId, Function.identity()));
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) {
                return Optional.empty();
            }
            for (JsonNode block : root) {
                if (!"image".equals(block.path("type").asText())) {
                    continue;
                }
                Long mediaId = block.path("mediaId").canConvertToLong() ? block.path("mediaId").asLong() : null;
                if (mediaId != null && imagesById.containsKey(mediaId)) {
                    return Optional.of(imagesById.get(mediaId));
                }
            }
        } catch (Exception ignored) {
            return Optional.empty();
        }
        return Optional.empty();
    }

    // ---- Internals ---------------------------------------------------------------------------

    private CommunityPost requirePost(Long postId) {
        return communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void deleteStoredFile(String storedName, Set<String> preservedStoredNames) {
        if (storedName == null || preservedStoredNames.contains(storedName) || deletionArchiveService.isArchivedStoredName(storedName)) {
            return;
        }
        storageService.delete(storedName);
    }

    private boolean isAllowedArchiveFile(String originalName, String contentType) {
        String lowerName = originalName.toLowerCase(Locale.ROOT);
        return lowerName.endsWith(".zip") && (contentType == null || contentType.isBlank() || ALLOWED_FILE_TYPES.contains(contentType));
    }

    private String normalizeArchiveMime(String contentType) {
        return contentType == null || contentType.isBlank() || "application/octet-stream".equals(contentType)
                ? "application/zip"
                : contentType;
    }

    private static List<Long> postIds(List<CommunityPost> posts) {
        return posts.stream().map(CommunityPost::getId).filter(Objects::nonNull).toList();
    }
}
