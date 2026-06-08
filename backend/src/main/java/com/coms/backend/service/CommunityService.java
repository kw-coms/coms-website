package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostImage;
import com.coms.backend.domain.CommunityPostFile;
import com.coms.backend.domain.CommunityPostVideo;
import com.coms.backend.domain.CommunityPostVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityCommentResponse;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.Locale;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@Transactional
public class CommunityService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern HTML_TAG = Pattern.compile("<(/?)([A-Za-z][A-Za-z0-9]*)([^>]*)>");
    private static final Pattern STYLE_DECLARATION = Pattern.compile("(?i)(color|background-color)\\s*:\\s*([^;\"']+)");
    private static final Pattern FONT_COLOR = Pattern.compile("(?i)\\bcolor\\s*=\\s*([\"']?)(#[0-9a-fA-F]{3,8}|rgba?\\([0-9.,%\\s]+\\))\\1");
    private static final Pattern SAFE_COLOR = Pattern.compile("(?i)^(#[0-9a-f]{3,8}|rgba?\\([0-9.,%\\s]+\\))$");
    private static final int MAX_TITLE_LENGTH = 120;
    private static final int MAX_CONTENT_LENGTH = 50000;
    private static final int MAX_COMMENT_LENGTH = 1000;
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 100L * 1024 * 1024;
    private static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
    private static final long CONCEPT_POST_SCORE_THRESHOLD = 5;
    private static final int MAX_EXTRA_IMAGES_PER_POST = 5;
    private static final int MAX_VIDEOS_PER_POST = 3;
    private static final int MAX_FILES_PER_POST = 5;
    private static final int MAX_POSTS_PER_MINUTE = 5;
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");
    private static final Set<String> ALLOWED_VIDEO_TYPES = Set.of("video/mp4", "video/webm", "video/quicktime");
    private static final Set<String> ALLOWED_FILE_TYPES = Set.of(
            "application/zip",
            "application/x-zip-compressed",
            "application/octet-stream"
    );

    private final CommunityPostRepository communityPostRepository;
    private final CommunityPostVoteRepository voteRepository;
    private final MemberRepository memberRepository;
    private final StorageService storageService;
    private final CommunityCommentRepository commentRepository;
    private final NotificationService notificationService;
    private final CommunityPostImageRepository imageRepository;
    private final CommunityPostFileRepository fileRepository;
    private final CommunityPostVideoRepository videoRepository;
    private final AuditLogService auditLogService;

    public CommunityService(CommunityPostRepository communityPostRepository,
                            CommunityPostVoteRepository voteRepository,
                            MemberRepository memberRepository,
                            StorageService storageService,
                            CommunityCommentRepository commentRepository,
                            NotificationService notificationService,
                            CommunityPostImageRepository imageRepository,
                            CommunityPostFileRepository fileRepository,
                            CommunityPostVideoRepository videoRepository,
                            AuditLogService auditLogService) {
        this.communityPostRepository = communityPostRepository;
        this.voteRepository = voteRepository;
        this.memberRepository = memberRepository;
        this.commentRepository = commentRepository;
        this.storageService = storageService;
        this.notificationService = notificationService;
        this.imageRepository = imageRepository;
        this.fileRepository = fileRepository;
        this.videoRepository = videoRepository;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public List<CommunityPostResponse> list(String studentId) {
        Member member = findMember(studentId);
        List<CommunityPost> posts = communityPostRepository.findAllByOrderByCreatedAtDesc();
        Map<String, Member> authors = memberRepository.findByStudentIdIn(posts.stream()
                        .map(CommunityPost::getAuthorStudentId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(Member::getStudentId, Function.identity()));
        Map<Long, VoteSummary> stats = voteStats(posts);
        Map<Long, Long> commentCounts = commentCounts(posts);
        return posts.stream()
                .map(post -> toResponse(post, member, authors.get(post.getAuthorStudentId()), stats, commentCounts, false))
                .toList();
    }

    public CommunityPostResponse get(String studentId, Long id) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        post.incrementViewCount();
        CommunityPost saved = communityPostRepository.save(post);
        return toResponse(saved, member, memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), true);
    }

    public CommunityPostResponse create(String studentId, CommunityPostRequest request, MultipartFile image) {
        Member member = findMember(studentId);
        enforcePostRateLimit(member.getStudentId());
        SanitizedPost sanitized = validateRequest(request, null);
        CommunityPost post = new CommunityPost();
        post.setTitle(sanitized.title());
        post.setContent(sanitized.content());
        post.setCategory(sanitized.category());
        post.setAuthorStudentId(member.getStudentId());
        post.setAuthorName(member.getName());
        attachImage(post, image);
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_CREATE", "COMMUNITY_POST", String.valueOf(saved.getId()), safeTitle(saved.getTitle()), null);
        return toResponse(saved, member, member, voteStats(List.of(saved)), commentCounts(List.of(saved)), true);
    }

    public CommunityPostResponse update(String studentId, Long id, CommunityPostRequest request, MultipartFile image) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        SanitizedPost sanitized = validateRequest(request, post.getTitle());
        boolean isInitialFinalization = isInitialFinalization(post, sanitized.content());
        post.setContent(sanitized.content());
        post.setCategory(sanitized.category());
        if (Boolean.TRUE.equals(request.removeImage())) {
            clearImage(post);
        }
        attachImage(post, image);
        if (!isInitialFinalization) {
            post.markEdited();
        }
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_UPDATE", "COMMUNITY_POST", String.valueOf(saved.getId()), safeTitle(saved.getTitle()), null);
        return toResponse(saved, member,
                memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), true);
    }

    public void delete(String studentId, Long id) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        clearImage(post);
        clearExtraImages(post.getId());
        voteRepository.deleteByPost(post);
        commentRepository.deleteByPostId(post.getId());
        communityPostRepository.delete(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_DELETE", "COMMUNITY_POST", String.valueOf(id), safeTitle(post.getTitle()), null);
    }

    public CommunityPostResponse vote(String studentId, Long id, int value) {
        if (value < -1 || value > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid vote value.");
        }
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Optional<CommunityPostVote> existing = voteRepository.findByPostAndStudentId(post, member.getStudentId());
        if (value == 0) {
            existing.ifPresent(voteRepository::delete);
        } else if (existing.isPresent()) {
            CommunityPostVote vote = existing.get();
            if (vote.getValue() == value) {
                voteRepository.delete(vote);
            } else {
                vote.setValue(value);
                voteRepository.save(vote);
            }
        } else {
            CommunityPostVote vote = new CommunityPostVote();
            vote.setPost(post);
            vote.setStudentId(member.getStudentId());
            vote.setValue(value);
            voteRepository.save(vote);
        }
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_VOTE", "COMMUNITY_POST", String.valueOf(post.getId()), "value=" + value, null);
        return toResponse(post, member, memberRepository.findByStudentId(post.getAuthorStudentId()).orElse(null),
                voteStats(List.of(post)), commentCounts(List.of(post)), true);
    }

    @Transactional(readOnly = true)
    public CommunityPost imagePost(Long id) {
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (post.getImageStoredName() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return post;
    }

    @Transactional(readOnly = true)
    public Resource loadImage(Long id) {
        CommunityPost post = imagePost(id);
        return storageService.load(post.getImageStoredName());
    }

    private Member findMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private SanitizedPost validateRequest(CommunityPostRequest request, String existingTitle) {
        String title = normalizeBounded(request.title(), "제목", MAX_TITLE_LENGTH);
        String content = sanitizeCommunityContent(normalizeBounded(request.content(), "내용", MAX_CONTENT_LENGTH));
        if (existingTitle != null && !title.equals(existingTitle)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "제목은 수정할 수 없습니다.");
        }
        rejectUnsafeText(title);
        rejectUnsafeText(content);
        return new SanitizedPost(title, content, parseCategory(request.category()));
    }

    private String normalizeBounded(String value, String fieldName, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + "을 입력해주세요.");
        }
        if (normalized.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + "은 " + maxLength + "자 이하로 입력해주세요.");
        }
        if (normalized.chars().anyMatch(ch -> Character.isISOControl(ch) && ch != '\n' && ch != '\r' && ch != '\t')) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "허용되지 않는 제어 문자가 포함되어 있습니다.");
        }
        return normalized;
    }

    private void rejectUnsafeText(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.contains("<script") || lower.contains("</script")
                || lower.contains("<iframe") || lower.contains("javascript:")
                || lower.matches(".*\\son[a-z]+\\s*=.*")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보안상 허용되지 않는 내용이 포함되어 있습니다.");
        }
    }

    private void enforcePostRateLimit(String studentId) {
        LocalDateTime windowStart = LocalDateTime.now().minusMinutes(1);
        long recentPostCount = communityPostRepository.countByAuthorStudentIdAndCreatedAtAfter(studentId, windowStart);
        if (recentPostCount >= MAX_POSTS_PER_MINUTE) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "게시글은 1분에 최대 " + MAX_POSTS_PER_MINUTE + "개까지 작성할 수 있습니다.");
        }
    }

    private String sanitizeCommunityContent(String content) {
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) {
                rejectUnsafeText(content);
                return content;
            }
            ArrayNode sanitized = JSON.createArrayNode();
            for (JsonNode block : root) {
                if (!block.isObject()) continue;
                ObjectNode copy = ((ObjectNode) block).deepCopy();
                if ("text".equals(copy.path("type").asText())) {
                    copy.put("content", sanitizeRichText(copy.path("content").asText("")));
                }
                sanitized.add(copy);
            }
            return JSON.writeValueAsString(sanitized);
        } catch (Exception ignored) {
            rejectUnsafeText(content);
            return content;
        }
    }

    private String sanitizeRichText(String html) {
        Matcher matcher = HTML_TAG.matcher(html == null ? "" : html);
        StringBuilder out = new StringBuilder();
        int last = 0;
        while (matcher.find()) {
            out.append(escapeHtml(html.substring(last, matcher.start())));
            String closing = matcher.group(1);
            String tag = matcher.group(2).toLowerCase(Locale.ROOT);
            String attrs = matcher.group(3) == null ? "" : matcher.group(3);
            out.append(sanitizeTag(closing, tag, attrs));
            last = matcher.end();
        }
        out.append(escapeHtml((html == null ? "" : html).substring(last)));
        return out.toString()
                .replaceAll("(?i)(<br>\\s*)+$", "")
                .trim();
    }

    private String sanitizeTag(String closing, String tag, String attrs) {
        if ("br".equals(tag)) return "<br>";
        if (Set.of("b", "strong", "i", "em", "u").contains(tag)) {
            return closing.isBlank() ? "<" + tag + ">" : "</" + tag + ">";
        }
        if ("span".equals(tag) || "font".equals(tag)) {
            if (!closing.isBlank()) return "</span>";
            String style = sanitizeInlineColorStyle(attrs);
            return style.isBlank() ? "<span>" : "<span style=\"" + style + "\">";
        }
        return "";
    }

    private String sanitizeInlineColorStyle(String attrs) {
        StringBuilder style = new StringBuilder();
        Matcher styleMatcher = STYLE_DECLARATION.matcher(attrs);
        while (styleMatcher.find()) {
            appendSafeStyle(style, styleMatcher.group(1).toLowerCase(Locale.ROOT), styleMatcher.group(2).trim());
        }
        Matcher fontMatcher = FONT_COLOR.matcher(attrs);
        if (fontMatcher.find()) {
            appendSafeStyle(style, "color", fontMatcher.group(2).trim());
        }
        return style.toString();
    }

    private void appendSafeStyle(StringBuilder style, String key, String value) {
        String cleanValue = value.replaceAll("\\s+", " ");
        if (!SAFE_COLOR.matcher(cleanValue).matches()) return;
        if (style.indexOf(key + ":") >= 0) return;
        if (!style.isEmpty()) style.append(';');
        style.append(key).append(':').append(cleanValue);
    }

    private String escapeHtml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private boolean isInitialFinalization(CommunityPost post, String nextContent) {
        return !post.isEdited()
                && java.time.Duration.between(post.getCreatedAt(), java.time.LocalDateTime.now()).toMinutes() < 5
                && isUploadFinalizationContent(post.getContent(), nextContent);
    }

    private boolean isUploadFinalizationContent(String currentContent, String nextContent) {
        if ("...".equals(currentContent)) return true;
        try {
            JsonNode root = JSON.readTree(nextContent);
            if (!root.isArray()) return false;
            for (JsonNode block : root) {
                if ("text".equals(block.path("type").asText())) {
                    return currentContent.equals(stripHtml(block.path("content").asText("")).trim());
                }
            }
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    private String stripHtml(String value) {
        return value == null ? "" : value
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("<[^>]+>", "")
                .replace("&nbsp;", " ")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
    }

    private CommunityPostResponse toResponse(CommunityPost post,
                                             Member currentMember,
                                             Member author,
                                             Map<Long, VoteSummary> voteStats,
                                             Map<Long, Long> commentCounts,
                                             boolean includeContent) {
        boolean editable = post.getAuthorStudentId().equals(currentMember.getStudentId())
                || currentMember.getRole() == Member.Role.ADMIN;
        boolean authorAdmin = author != null && author.getRole() == Member.Role.ADMIN;
        String authorName = author != null ? author.getName() : post.getAuthorName();
        VoteSummary votes = voteStats.getOrDefault(post.getId(), VoteSummary.EMPTY);
        long commentCount = commentCounts.getOrDefault(post.getId(), 0L);
        List<CommunityPostImage> extraImages = imageRepository.findByPostIdOrderByPositionAsc(post.getId());
        List<String> imageUrls = extraImages.stream()
                .map(img -> "/api/community/posts/" + post.getId() + "/images/" + img.getId())
                .toList();
        List<CommunityPostResponse.MediaInfo> imageInfos = extraImages.stream()
                .map(img -> new CommunityPostResponse.MediaInfo(
                        img.getId(),
                        "/api/community/posts/" + post.getId() + "/images/" + img.getId(),
                        img.getOriginalName()))
                .toList();
        List<CommunityPostResponse.MediaInfo> videoInfos = videoRepository.findByPostIdOrderByPositionAsc(post.getId())
                .stream()
                .map(vid -> new CommunityPostResponse.MediaInfo(
                        vid.getId(),
                        "/api/community/posts/" + post.getId() + "/videos/" + vid.getId(),
                        vid.getOriginalName()))
                .toList();
        List<CommunityPostResponse.MediaInfo> fileInfos = fileRepository.findByPostIdOrderByPositionAsc(post.getId())
                .stream()
                .map(file -> new CommunityPostResponse.MediaInfo(
                        file.getId(),
                        "/api/community/posts/" + post.getId() + "/files/" + file.getId() + "/download",
                        file.getOriginalName()))
                .toList();
        return new CommunityPostResponse(
                post.getId(),
                post.getTitle(),
                includeContent ? post.getContent() : preview(post.getContent()),
                post.getAuthorStudentId(),
                authorName,
                displayName(post.getAuthorStudentId(), authorName),
                authorAdmin,
                post.getCategory().name(),
                post.getImageStoredName() == null ? null : "/api/community/posts/" + post.getId() + "/image",
                post.getImageOriginalName(),
                imageUrls,
                imageInfos,
                videoInfos,
                fileInfos,
                post.getViewCount(),
                votes.upvotes(),
                votes.downvotes(),
                commentCount,
                votes.myVote(currentMember.getStudentId()),
                votes.netScore() >= CONCEPT_POST_SCORE_THRESHOLD,
                post.getCreatedAt(),
                post.getUpdatedAt(),
                post.isEdited(),
                editable
        );
    }

    static String displayName(String studentId, String name) {
        String trimmedName = name == null ? "" : name.trim();
        String generation = generationFromStudentId(studentId);
        return generation.isBlank() ? trimmedName : generation + " " + trimmedName;
    }

    static String generationFromStudentId(String studentId) {
        if (studentId == null || !studentId.matches("\\d{10}")) {
            return "";
        }
        int admissionYear = Integer.parseInt(studentId.substring(0, 4));
        int generation = admissionYear - 1966;
        return generation > 0 ? generation + "기" : "";
    }

    public List<Long> addImages(String studentId, Long postId, List<MultipartFile> images) {
        if (images == null || images.isEmpty()) return List.of();
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostOwnerOrAdmin(post, member);
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
                String stored = storageService.store(image);
                CommunityPostImage saved = imageRepository.save(new CommunityPostImage(postId, stored, image.getOriginalFilename(), contentType, startPos + i));
                createdIds.add(saved.getId());
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
            }
        }
        return createdIds;
    }

    public void deleteImage(String studentId, Long postId, Long imageId) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostOwnerOrAdmin(post, member);
        CommunityPostImage img = imageRepository.findById(imageId)
                .filter(i -> i.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        storageService.delete(img.getStoredName());
        imageRepository.delete(img);
    }

    public Long addVideo(String studentId, Long postId, MultipartFile video) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostOwnerOrAdmin(post, member);
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

    public Long addFile(String studentId, Long postId, MultipartFile file) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostOwnerOrAdmin(post, member);
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

    public void deleteVideo(String studentId, Long postId, Long videoId) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostOwnerOrAdmin(post, member);
        CommunityPostVideo vid = videoRepository.findById(videoId)
                .filter(v -> v.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        storageService.delete(vid.getStoredName());
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

    public CommunityPostFile loadFileMeta(Long postId, Long fileId) {
        return fileRepository.findById(fileId)
                .filter(file -> file.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    public Resource loadFile(Long postId, Long fileId) {
        CommunityPostFile file = loadFileMeta(postId, fileId);
        return storageService.load(file.getStoredName());
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

    private void attachImage(CommunityPost post, MultipartFile image) {
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
            post.setImageStoredName(storageService.store(image));
            post.setImageOriginalName(image.getOriginalFilename());
            post.setImageMimeType(contentType);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
        }
    }

    private void requirePostOwnerOrAdmin(CommunityPost post, Member member) {
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    private CommunityPost.Category parseCategory(String value) {
        if (value == null || value.isBlank()) {
            return CommunityPost.Category.GENERAL;
        }
        try {
            return CommunityPost.Category.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid community category.");
        }
    }

    private void clearImage(CommunityPost post) {
        if (post.getImageStoredName() != null) {
            storageService.delete(post.getImageStoredName());
        }
        post.setImageStoredName(null);
        post.setImageOriginalName(null);
        post.setImageMimeType(null);
    }

    private void clearExtraImages(Long postId) {
        List<CommunityPostImage> images = imageRepository.findByPostIdOrderByPositionAsc(postId);
        images.forEach(image -> storageService.delete(image.getStoredName()));
        imageRepository.deleteByPostId(postId);
        List<CommunityPostVideo> videos = videoRepository.findByPostIdOrderByPositionAsc(postId);
        videos.forEach(video -> storageService.delete(video.getStoredName()));
        videoRepository.deleteByPostId(postId);
        List<CommunityPostFile> files = fileRepository.findByPostIdOrderByPositionAsc(postId);
        files.forEach(file -> storageService.delete(file.getStoredName()));
        fileRepository.deleteByPostId(postId);
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

    private record SanitizedPost(String title, String content, CommunityPost.Category category) {}

    private String preview(String content) {
        if (content == null || content.length() <= 160) {
            return content;
        }
        return content.substring(0, 160);
    }

    private String safeTitle(String title) {
        return title == null || title.isBlank() ? null : "title=" + preview(title);
    }

    private Map<Long, Long> commentCounts(List<CommunityPost> posts) {
        List<Long> postIds = posts.stream().map(CommunityPost::getId).filter(Objects::nonNull).toList();
        if (postIds.isEmpty()) {
            return Map.of();
        }
        return commentRepository.countByPostIds(postIds).stream()
                .collect(Collectors.toMap(CommunityCommentRepository.CommentCount::getPostId, CommunityCommentRepository.CommentCount::getCount));
    }

    private Map<Long, VoteSummary> voteStats(List<CommunityPost> posts) {
        List<Long> postIds = posts.stream().map(CommunityPost::getId).filter(Objects::nonNull).toList();
        if (postIds.isEmpty()) {
            return Map.of();
        }
        return voteRepository.findByPostIdIn(postIds).stream()
                .collect(Collectors.groupingBy(
                        vote -> vote.getPost().getId(),
                        Collectors.collectingAndThen(Collectors.toList(), VoteSummary::from)
                ));
    }

    @Transactional(readOnly = true)
    public List<CommunityCommentResponse> listComments(Long postId, String studentId) {
        if (!communityPostRepository.existsById(postId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        boolean isAdmin = member.getRole() == Member.Role.ADMIN;
        return commentRepository.findByPostIdOrderByCreatedAtAsc(postId).stream()
                .map(c -> new CommunityCommentResponse(
                        c.getId(), c.getPostId(), c.getParentCommentId(), c.getDepth(),
                        c.getAuthorName(), c.getContent(), c.getCreatedAt(), c.getUpdatedAt(), c.isEdited(),
                        isAdmin || c.getStudentId().equals(studentId)))
                .toList();
    }

    public CommunityCommentResponse addComment(Long postId, String studentId, CommunityCommentRequest request) {
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String content = normalizeBounded(request.content(), "댓글", MAX_COMMENT_LENGTH);
        rejectUnsafeText(content);
        CommunityComment parent = null;
        int depth = 0;
        if (request.parentCommentId() != null) {
            parent = commentRepository.findById(request.parentCommentId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            if (!parent.getPostId().equals(postId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reply parent does not belong to this post.");
            }
            depth = parent.getDepth() + 1;
        }
        CommunityComment saved = commentRepository.save(
                new CommunityComment(postId, studentId, member.getName(), content, request.parentCommentId(), depth));
        if (parent == null) {
            notificationService.notifyPostComment(post, saved);
        } else {
            notificationService.notifyCommentReply(post, parent, saved);
        }
        auditLogService.record(member.getStudentId(), "COMMUNITY_COMMENT_CREATE", "COMMUNITY_COMMENT", String.valueOf(saved.getId()),
                "postId=" + postId + (saved.getParentCommentId() == null ? "" : ", parentCommentId=" + saved.getParentCommentId()), null);
        return new CommunityCommentResponse(saved.getId(), saved.getPostId(), saved.getParentCommentId(), saved.getDepth(), saved.getAuthorName(),
                saved.getContent(), saved.getCreatedAt(), saved.getUpdatedAt(), saved.isEdited(), true);
    }

    public CommunityCommentResponse updateComment(Long postId, Long commentId, String studentId, CommunityCommentRequest request) {
        CommunityComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!comment.getPostId().equals(postId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!comment.getStudentId().equals(studentId) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        String content = normalizeBounded(request.content(), "댓글", MAX_COMMENT_LENGTH);
        rejectUnsafeText(content);
        comment.markEdited(content);
        CommunityComment saved = commentRepository.save(comment);
        auditLogService.record(member.getStudentId(), "COMMUNITY_COMMENT_UPDATE", "COMMUNITY_COMMENT", String.valueOf(saved.getId()),
                "postId=" + postId, null);
        return new CommunityCommentResponse(saved.getId(), saved.getPostId(), saved.getParentCommentId(), saved.getDepth(),
                saved.getAuthorName(), saved.getContent(), saved.getCreatedAt(), saved.getUpdatedAt(), saved.isEdited(), true);
    }

    public void deleteComment(Long postId, Long commentId, String studentId) {
        CommunityComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!comment.getPostId().equals(postId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!comment.getStudentId().equals(studentId) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        deleteCommentTree(comment);
        auditLogService.record(member.getStudentId(), "COMMUNITY_COMMENT_DELETE", "COMMUNITY_COMMENT", String.valueOf(commentId),
                "postId=" + postId, null);
    }

    private void deleteCommentTree(CommunityComment comment) {
        commentRepository.findByParentCommentId(comment.getId()).forEach(this::deleteCommentTree);
        commentRepository.delete(comment);
    }

    private record VoteSummary(long upvotes, long downvotes, Map<String, Integer> byStudent) {
        static final VoteSummary EMPTY = new VoteSummary(0, 0, Map.of());

        static VoteSummary from(List<CommunityPostVote> votes) {
            long upvotes = votes.stream().filter(vote -> vote.getValue() > 0).count();
            long downvotes = votes.stream().filter(vote -> vote.getValue() < 0).count();
            Map<String, Integer> byStudent = votes.stream()
                    .collect(Collectors.toMap(CommunityPostVote::getStudentId, CommunityPostVote::getValue, (a, b) -> b));
            return new VoteSummary(upvotes, downvotes, byStudent);
        }

        int myVote(String studentId) {
            return byStudent.getOrDefault(studentId, 0);
        }

        long netScore() {
            return upvotes - downvotes;
        }
    }
}
