package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostImage;
import com.coms.backend.domain.CommunityPostFile;
import com.coms.backend.domain.CommunityPostVideo;
import com.coms.backend.domain.CommunityPostVote;
import com.coms.backend.domain.CommunityPollVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityCommentResponse;
import com.coms.backend.dto.CommunityPollVoteRequest;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.dto.YouTubeSearchResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Year;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
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
    private static final int MAX_DELETE_REASON_LENGTH = 300;
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 100L * 1024 * 1024;
    private static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
    private static final long CONCEPT_POST_SCORE_THRESHOLD = 5;
    private static final int MAX_EXTRA_IMAGES_PER_POST = 5;
    private static final int MAX_VIDEOS_PER_POST = 3;
    private static final int MAX_FILES_PER_POST = 5;
    private static final int MAX_POSTS_PER_MINUTE = 5;
    private static final int GRADUATE_AFTER_YEARS = 7;
    private static final Pattern TEN_DIGIT_STUDENT_ID = Pattern.compile("\\d{10}");
    private static final Pattern HTTPS_URL = Pattern.compile("^https://[^\\s<>\"']+$", Pattern.CASE_INSENSITIVE);
    private static final Pattern YOUTUBE_EMBED_URL = Pattern.compile("^https://www\\.youtube(-nocookie)?\\.com/embed/[A-Za-z0-9_-]{6,20}([?&][^\\s<>\"']*)?$", Pattern.CASE_INSENSITIVE);
    private static final String DEFAULT_ANONYMOUS_NAME = "ㅇㅇ";
    private static final int MAX_ANONYMOUS_NAME_LENGTH = 20;
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
    private final CommunityDeletionArchiveService deletionArchiveService;
    private final CommunityPollVoteRepository pollVoteRepository;
    private final HttpClient httpClient;
    private final String youtubeApiKey;
    private final byte[] anonymousTagKey;
    private static final String IP_TAG_CONTEXT = "coms-anonymous-ip-tag-v1";

    public CommunityService(CommunityPostRepository communityPostRepository,
                            CommunityPostVoteRepository voteRepository,
                            MemberRepository memberRepository,
                            StorageService storageService,
                            CommunityCommentRepository commentRepository,
                            NotificationService notificationService,
                            CommunityPostImageRepository imageRepository,
                            CommunityPostFileRepository fileRepository,
                            CommunityPostVideoRepository videoRepository,
                            AuditLogService auditLogService,
                            CommunityDeletionArchiveService deletionArchiveService,
                            CommunityPollVoteRepository pollVoteRepository,
                            @Value("${youtube.api-key:}") String youtubeApiKey,
                            @Value("${community.anonymous-salt:}") String anonymousSalt,
                            @Value("${jwt.secret:}") String jwtSecret) {
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
        this.deletionArchiveService = deletionArchiveService;
        this.pollVoteRepository = pollVoteRepository;
        this.httpClient = HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(3)).build();
        this.youtubeApiKey = youtubeApiKey == null ? "" : youtubeApiKey.trim();
        this.anonymousTagKey = resolveAnonymousTagKey(anonymousSalt, jwtSecret);
    }

    /**
     * Resolves the HMAC key used to tag anonymous posters. A dedicated {@code community.anonymous-salt}
     * is used as-is. Otherwise a separate key is derived from {@code jwt.secret} via HMAC over a fixed
     * context label, so the signing secret is never reused directly as the IP-tag key (key separation).
     */
    private static byte[] resolveAnonymousTagKey(String anonymousSalt, String jwtSecret) {
        if (anonymousSalt != null && !anonymousSalt.isBlank()) {
            return anonymousSalt.getBytes(StandardCharsets.UTF_8);
        }
        String base = jwtSecret == null || jwtSecret.isBlank() ? "coms-anonymous-display-salt" : jwtSecret;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(base.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(IP_TAG_CONTEXT.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to derive anonymous tag key", e);
        }
    }

    @Transactional(readOnly = true)
    public List<CommunityPostResponse> list(String studentId) {
        Member member = findMember(studentId);
        List<CommunityPost> posts = communityPostRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(post -> canViewPost(member, post))
                .toList();
        Map<String, Member> authors = memberRepository.findByStudentIdIn(posts.stream()
                        .map(CommunityPost::getAuthorStudentId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(Member::getStudentId, Function.identity()));
        Map<Long, VoteSummary> stats = voteStats(posts);
        Map<Long, Long> commentCounts = commentCounts(posts);
        Map<Long, List<CommunityPostResponse.PollResult>> pollResults = pollResults(posts, member.getStudentId());
        return posts.stream()
                .map(post -> toResponse(post, member, authors.get(post.getAuthorStudentId()), stats, commentCounts, pollResults, false))
                .toList();
    }

    public CommunityPostResponse get(String studentId, Long id) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
        post.incrementViewCount();
        CommunityPost saved = communityPostRepository.save(post);
        return toResponse(saved, member, memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    public CommunityPostResponse create(String studentId, CommunityPostRequest request, MultipartFile image) {
        return create(studentId, request, image, null);
    }

    public CommunityPostResponse create(String studentId, CommunityPostRequest request, MultipartFile image, String clientIp) {
        Member member = findMember(studentId);
        enforcePostRateLimit(member.getStudentId());
        SanitizedPost sanitized = validateRequest(request, null);
        requireCategoryAllowed(member, sanitized.category());
        CommunityPost post = new CommunityPost();
        post.setTitle(sanitized.title());
        post.setContent(sanitized.content());
        post.setCategory(sanitized.category());
        post.setAuthorStudentId(member.getStudentId());
        post.setAuthorName(member.getName());
        applyAnonymousPostFields(post, sanitized.category(), request.anonymousName(), clientIp);
        attachImage(post, image);
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_CREATE", "COMMUNITY_POST", String.valueOf(saved.getId()), safeTitle(saved.getTitle()), null);
        return toResponse(saved, member, member, voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    public CommunityPostResponse update(String studentId, Long id, CommunityPostRequest request, MultipartFile image) {
        return update(studentId, id, request, image, null);
    }

    public CommunityPostResponse update(String studentId, Long id, CommunityPostRequest request, MultipartFile image, String clientIp) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        SanitizedPost sanitized = validateRequest(request, post.getTitle());
        requireCategoryAllowed(member, sanitized.category());
        boolean titleChanged = !sanitized.title().equals(post.getTitle());
        boolean isInitialFinalization = isInitialFinalization(post, sanitized.content());
        boolean wasAnonymous = isAnonymousPost(post);
        post.setTitle(sanitized.title());
        post.setContent(sanitized.content());
        post.setCategory(sanitized.category());
        preserveAnonymousPostFields(post, wasAnonymous, sanitized.category(), request.anonymousName(), clientIp);
        if (Boolean.TRUE.equals(request.removeImage())) {
            clearImage(post);
        }
        attachImage(post, image);
        if (titleChanged || !isInitialFinalization) {
            post.markEdited();
        }
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_UPDATE", "COMMUNITY_POST", String.valueOf(saved.getId()), safeTitle(saved.getTitle()), null);
        return toResponse(saved, member,
                memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    public void delete(String studentId, Long id) {
        delete(studentId, id, null);
    }

    public void delete(String studentId, Long id, String reason) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        String normalizedReason = normalizeDeleteReason(reason);
        if (member.getRole() == Member.Role.ADMIN
                && !post.getAuthorStudentId().equals(member.getStudentId())
                && normalizedReason == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "관리자 삭제 사유를 입력해주세요.");
        }
        String detail = deletionAuditDetail(post, member, normalizedReason);
        var snapshot = deletionArchiveService.record(post, member, normalizedReason == null ? "직접 삭제" : normalizedReason);
        deletePostData(post, deletionArchiveService.archivedStoredNames(snapshot.getId()));
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_DELETE", "COMMUNITY_POST", String.valueOf(id), detail, null);
        if (!snapshot.getAuthorStudentId().equals(member.getStudentId())) {
            notificationService.notifyPostDeleted(snapshot, member.getStudentId(), member.getName());
        }
    }

    public CommunityPostResponse vote(String studentId, Long id, int value) {
        if (value < -1 || value > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid vote value.");
        }
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
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
                voteStats(List.of(post)), commentCounts(List.of(post)), pollResults(List.of(post), member.getStudentId()), true);
    }

    public CommunityPostResponse votePoll(String studentId, Long id, CommunityPollVoteRequest request) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
        PollDefinition poll = pollDefinitions(post.getContent()).stream()
                .filter(item -> item.pollId().equals(request.pollId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "투표를 찾을 수 없습니다."));
        int optionIndex = request.optionIndex();
        if (optionIndex < 0 || optionIndex >= poll.optionCount()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 선택지가 올바르지 않습니다.");
        }
        if (poll.isClosed()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "종료된 투표입니다.");
        }
        Optional<CommunityPollVote> existing = pollVoteRepository.findByPostIdAndPollIdAndStudentId(post.getId(), poll.pollId(), member.getStudentId());
        if (existing.isPresent()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 투표했습니다. 투표는 변경하거나 취소할 수 없습니다.");
        } else {
            CommunityPollVote vote = new CommunityPollVote();
            vote.setPostId(post.getId());
            vote.setPollId(poll.pollId());
            vote.setStudentId(member.getStudentId());
            vote.setOptionIndex(optionIndex);
            pollVoteRepository.save(vote);
        }
        auditLogService.record(member.getStudentId(), "COMMUNITY_POLL_VOTE", "COMMUNITY_POST", String.valueOf(post.getId()), "pollId=" + poll.pollId(), null);
        return toResponse(post, member, memberRepository.findByStudentId(post.getAuthorStudentId()).orElse(null),
                voteStats(List.of(post)), commentCounts(List.of(post)), pollResults(List.of(post), member.getStudentId()), true);
    }

    public CommunityPostResponse closePoll(String studentId, Long id, String pollId) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
        requirePostOwnerOrAdmin(post, member);
        String closedContent = closePollInContent(post.getContent(), pollId);
        post.setContent(closedContent);
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POLL_CLOSE", "COMMUNITY_POST", String.valueOf(post.getId()), "pollId=" + pollId, null);
        return toResponse(saved, member, memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    @Transactional(readOnly = true)
    public YouTubeSearchResponse searchYouTube(String query) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.length() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "검색어를 2자 이상 입력해주세요.");
        }
        if (youtubeApiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "YouTube API 키가 설정되지 않았습니다.");
        }
        try {
            String encoded = URLEncoder.encode(trimmed, StandardCharsets.UTF_8);
            URI uri = URI.create("https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=" + encoded + "&key=" + URLEncoder.encode(youtubeApiKey, StandardCharsets.UTF_8));
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(java.time.Duration.ofSeconds(5)).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "YouTube 검색 응답이 올바르지 않습니다.");
            }
            JsonNode root = JSON.readTree(response.body());
            List<YouTubeSearchResponse.Item> items = new ArrayList<>();
            for (JsonNode item : root.path("items")) {
                String videoId = item.path("id").path("videoId").asText("");
                if (videoId.isBlank()) continue;
                JsonNode snippet = item.path("snippet");
                String thumbnail = snippet.path("thumbnails").path("medium").path("url").asText(
                        snippet.path("thumbnails").path("default").path("url").asText(""));
                items.add(new YouTubeSearchResponse.Item(
                        videoId,
                        snippet.path("title").asText("YouTube video"),
                        thumbnail,
                        snippet.path("channelTitle").asText("")
                ));
            }
            return new YouTubeSearchResponse(items);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "YouTube 검색에 실패했습니다.");
        }
    }

    public void deleteCommunityDataForMember(String studentId) {
        if (studentId == null || studentId.isBlank()) return;
        List<CommunityPost> posts = communityPostRepository.findByAuthorStudentId(studentId);
        posts.forEach(this::deletePostData);
        pollVoteRepository.deleteByStudentId(studentId);
        voteRepository.deleteByStudentId(studentId);
        Set<Long> deletedCommentIds = new java.util.HashSet<>();
        commentRepository.findByStudentId(studentId).forEach(comment -> deleteCommentTree(comment, deletedCommentIds));
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

    @Transactional(readOnly = true)
    public CommunityPostSharePreview sharePreview(Long id) {
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (isAnonymousPost(post)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return new CommunityPostSharePreview(
                post.getId(),
                post.getTitle(),
                shareDescription(post.getContent()),
                hasShareImage(post)
        );
    }

    @Transactional(readOnly = true)
    public CommunityPostShareImage loadShareImage(Long id) {
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (isAnonymousPost(post)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Optional<CommunityPostImage> contentImage = firstShareImage(post);
        if (contentImage.isPresent()) {
            CommunityPostImage image = contentImage.get();
            return new CommunityPostShareImage(
                    storageService.load(image.getStoredName()),
                    image.getOriginalName(),
                    image.getMimeType()
            );
        }
        if (post.getImageStoredName() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return new CommunityPostShareImage(
                storageService.load(post.getImageStoredName()),
                post.getImageOriginalName(),
                post.getImageMimeType()
        );
    }

    @Transactional(readOnly = true)
    public void requireReadablePost(String studentId, Long postId) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
    }

    private Member findMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private boolean canViewPost(Member member, CommunityPost post) {
        return !isAnonymousPost(post) || member.getRole() == Member.Role.ADMIN || !isGraduate(member);
    }

    private void requirePostVisible(Member member, CommunityPost post) {
        if (!canViewPost(member, post)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    private void requireCategoryAllowed(Member member, CommunityPost.Category category) {
        if (category == CommunityPost.Category.ANONYMOUS && member.getRole() != Member.Role.ADMIN && isGraduate(member)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid community category.");
        }
    }

    private boolean isAnonymousPost(CommunityPost post) {
        return post.getCategory() == CommunityPost.Category.ANONYMOUS;
    }

    private boolean hasShareImage(CommunityPost post) {
        return firstShareImage(post).isPresent()
                || post.getImageStoredName() != null;
    }

    private Optional<CommunityPostImage> firstShareImage(CommunityPost post) {
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

    private boolean isGraduate(Member member) {
        String studentId = member.getStudentId();
        if (studentId == null || !TEN_DIGIT_STUDENT_ID.matcher(studentId).matches()) {
            return true;
        }
        int admissionYear = Integer.parseInt(studentId.substring(0, 4));
        return admissionYear <= Year.now().getValue() - GRADUATE_AFTER_YEARS;
    }

    private SanitizedPost validateRequest(CommunityPostRequest request, String existingTitle) {
        String title = normalizeBounded(request.title(), "제목", MAX_TITLE_LENGTH);
        String content = sanitizeCommunityContent(normalizeBounded(request.content(), "내용", MAX_CONTENT_LENGTH));
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

    private void applyAnonymousPostFields(CommunityPost post, CommunityPost.Category category, String anonymousName, String clientIp) {
        if (category != CommunityPost.Category.ANONYMOUS) {
            post.setAnonymousName(null);
            post.setIpAddress(null);
            return;
        }
        post.setAnonymousName(normalizeAnonymousName(anonymousName));
        if ((post.getIpAddress() == null || post.getIpAddress().isBlank()) && clientIp != null && !clientIp.isBlank()) {
            post.setIpAddress(clientIp.trim());
        }
    }

    /**
     * Preserves the anonymous identity (display name + IP tag) of an existing post across edits.
     * The identity is frozen at creation: editing — even by an admin or a non-author — must never
     * reassign authorship. If the post stays anonymous, the original anonymousName/ipAddress are kept
     * verbatim; only a genuine category transition re-derives the fields.
     */
    private void preserveAnonymousPostFields(CommunityPost post, boolean wasAnonymous, CommunityPost.Category category,
                                             String anonymousName, String clientIp) {
        if (category != CommunityPost.Category.ANONYMOUS) {
            post.setAnonymousName(null);
            post.setIpAddress(null);
            return;
        }
        if (wasAnonymous) {
            // Already anonymous: keep the stored identity untouched regardless of who is editing.
            return;
        }
        applyAnonymousPostFields(post, category, anonymousName, clientIp);
    }

    private void applyAnonymousCommentFields(CommunityPost post, CommunityComment comment, String anonymousName, String clientIp) {
        if (!isAnonymousPost(post)) {
            comment.setAnonymousName(null);
            comment.setIpAddress(null);
            return;
        }
        comment.setAnonymousName(normalizeAnonymousName(anonymousName));
        comment.setIpAddress(clientIp == null || clientIp.isBlank() ? null : clientIp.trim());
    }

    private String normalizeAnonymousName(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) return DEFAULT_ANONYMOUS_NAME;
        if (normalized.length() > MAX_ANONYMOUS_NAME_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "익명 이름은 " + MAX_ANONYMOUS_NAME_LENGTH + "자 이하로 입력해주세요.");
        }
        rejectUnsafeText(normalized);
        return normalized;
    }

    private String anonymousDisplayName(String anonymousName, String ipAddress) {
        String name = normalizeAnonymousName(anonymousName);
        String tag = anonymousTag(ipAddress);
        return tag == null ? name : name + "(" + tag + ")";
    }

    /**
     * Derives a short, opaque, salted tag from the client IP. Same IP yields the same tag (so
     * sockpuppets within a thread stay linkable) while revealing nothing about the real network —
     * unlike a raw IP prefix, which deanonymizes posters in a small community. The full IP remains
     * in the database for admin moderation only.
     */
    private String anonymousTag(String ipAddress) {
        if (ipAddress == null || ipAddress.isBlank()) return null;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(anonymousTagKey, "HmacSHA256"));
            byte[] digest = mac.doFinal(ipAddress.trim().getBytes(StandardCharsets.UTF_8));
            return String.format("%02x%02x", digest[0] & 0xff, digest[1] & 0xff);
        } catch (Exception e) {
            return null;
        }
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
                String type = copy.path("type").asText();
                if ("text".equals(type)) {
                    copy.put("content", sanitizeRichText(copy.path("content").asText("")));
                } else if ("externalEmbed".equals(type)) {
                    sanitizeExternalEmbed(copy);
                } else if ("poll".equals(type)) {
                    sanitizePollBlock(copy);
                }
                sanitized.add(copy);
            }
            return JSON.writeValueAsString(sanitized);
        } catch (Exception ignored) {
            rejectUnsafeText(content);
            return content;
        }
    }

    private void sanitizeExternalEmbed(ObjectNode copy) {
        String kind = copy.path("kind").asText("");
        String provider = copy.path("provider").asText("");
        String url = copy.path("url").asText("");
        String embedUrl = copy.path("embedUrl").asText("");
        if (!Set.of("youtube", "image", "video").contains(kind) || !Set.of("youtube", "external").contains(provider)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하지 않는 외부 콘텐츠입니다.");
        }
        if (!url.isBlank() && !HTTPS_URL.matcher(url).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "외부 콘텐츠는 HTTPS URL만 사용할 수 있습니다.");
        }
        if ("youtube".equals(kind)) {
            if (!YOUTUBE_EMBED_URL.matcher(embedUrl).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "YouTube 임베드 주소가 올바르지 않습니다.");
            }
        } else if (!HTTPS_URL.matcher(url).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "외부 콘텐츠 주소가 올바르지 않습니다.");
        }
        copy.put("title", normalizeOptional(copy.path("title").asText(""), 160));
        copy.put("thumbnailUrl", normalizeOptional(copy.path("thumbnailUrl").asText(""), 500));
        copy.put("width", Math.max(25, Math.min(100, copy.path("width").asInt(75))));
        copy.put("align", normalizeAlign(copy.path("align").asText("left")));
    }

    private void sanitizePollBlock(ObjectNode copy) {
        String pollId = normalizeOptional(copy.path("pollId").asText(""), 80);
        String question = normalizeOptional(copy.path("question").asText(""), 160);
        if (pollId.isBlank() || question.isBlank() || !pollId.matches("[A-Za-z0-9_-]{6,80}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 정보가 올바르지 않습니다.");
        }
        ArrayNode options = JSON.createArrayNode();
        for (JsonNode option : copy.path("options")) {
            ObjectNode optionCopy = JSON.createObjectNode();
            String label = option.isObject()
                    ? normalizeOptional(option.path("label").asText(""), 80)
                    : normalizeOptional(option.asText(""), 80);
            if (label.isBlank()) continue;
            optionCopy.put("label", label);
            if (option.isObject()) {
                String imageUrl = normalizeOptional(option.path("imageUrl").asText(""), 500);
                if (!imageUrl.isBlank()) {
                    if (!HTTPS_URL.matcher(imageUrl).matches()) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 보기 이미지는 HTTPS URL만 사용할 수 있습니다.");
                    }
                    optionCopy.put("imageUrl", imageUrl);
                }
            }
            options.add(optionCopy);
            if (options.size() >= 10) break;
        }
        if (options.size() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 선택지는 2개 이상 필요합니다.");
        }
        copy.set("options", options);
        normalizePollDate(copy, "closesAt");
        normalizePollDate(copy, "closedAt");
    }

    private void normalizePollDate(ObjectNode copy, String fieldName) {
        String value = copy.path(fieldName).asText("");
        if (value.isBlank()) {
            copy.remove(fieldName);
            return;
        }
        try {
            copy.put(fieldName, LocalDateTime.parse(value).toString());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 종료 시간이 올바르지 않습니다.");
        }
    }

    private String normalizeOptional(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > maxLength) {
            normalized = normalized.substring(0, maxLength);
        }
        rejectUnsafeText(normalized);
        return normalized;
    }

    private String normalizeAlign(String align) {
        return Set.of("left", "center", "right").contains(align) ? align : "left";
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
                                             Map<Long, List<CommunityPostResponse.PollResult>> pollResults,
                                             boolean includeContent) {
        boolean editable = post.getAuthorStudentId().equals(currentMember.getStudentId())
                || currentMember.getRole() == Member.Role.ADMIN;
        boolean maskAnonymous = isAnonymousPost(post) && currentMember.getRole() != Member.Role.ADMIN;
        boolean authorAdmin = !maskAnonymous && author != null && author.getRole() == Member.Role.ADMIN;
        String anonymousDisplay = anonymousDisplayName(post.getAnonymousName(), post.getIpAddress());
        String authorName = maskAnonymous ? anonymousDisplay : (author != null ? author.getName() : post.getAuthorName());
        String authorStudentId = maskAnonymous ? null : post.getAuthorStudentId();
        String authorDisplayName = maskAnonymous ? anonymousDisplay : displayName(post.getAuthorStudentId(), authorName);
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
                authorStudentId,
                authorName,
                authorDisplayName,
                isAnonymousPost(post) ? post.getAnonymousName() : null,
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
                pollResults.getOrDefault(post.getId(), List.of()),
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
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostOwnerOrAdmin(post, member);
        CommunityPostImage img = imageRepository.findById(imageId)
                .filter(i -> i.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        deleteStoredFile(img.getStoredName(), Set.of());
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
            post.setImageStoredName(storageService.storeImage(image, contentType));
            post.setImageOriginalName(image.getOriginalFilename());
            post.setImageMimeType(contentType);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
        }
    }

    private void requirePostOwnerOrAdmin(CommunityPost post, Member member) {
        requirePostVisible(member, post);
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
        clearImage(post, Set.of());
    }

    private void clearImage(CommunityPost post, Set<String> preservedStoredNames) {
        if (post.getImageStoredName() != null) {
            deleteStoredFile(post.getImageStoredName(), preservedStoredNames);
        }
        post.setImageStoredName(null);
        post.setImageOriginalName(null);
        post.setImageMimeType(null);
    }

    private void clearExtraImages(Long postId) {
        clearExtraImages(postId, Set.of());
    }

    private void clearExtraImages(Long postId, Set<String> preservedStoredNames) {
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

    private String shareDescription(String content) {
        String plainText = plainTextContent(content).replaceAll("\\s+", " ").trim();
        return preview(plainText);
    }

    private String plainTextContent(String content) {
        if (content == null || content.isBlank()) {
            return "";
        }
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) {
                return stripHtml(content);
            }
            StringBuilder out = new StringBuilder();
            for (JsonNode block : root) {
                if (!block.isObject()) continue;
                String type = block.path("type").asText();
                String text = switch (type) {
                    case "text" -> stripHtml(block.path("content").asText(""));
                    case "poll" -> block.path("question").asText("");
                    case "externalEmbed" -> block.path("title").asText("");
                    default -> "";
                };
                if (!text.isBlank()) {
                    if (!out.isEmpty()) out.append(' ');
                    out.append(text.trim());
                }
            }
            return out.isEmpty() ? stripHtml(content) : out.toString();
        } catch (Exception ignored) {
            return stripHtml(content);
        }
    }

    private String safeTitle(String title) {
        return title == null || title.isBlank() ? null : "title=" + preview(title);
    }

    private String deletionAuditDetail(CommunityPost post, Member deletedBy, String reason) {
        String authorName = memberRepository.findByStudentId(post.getAuthorStudentId())
                .map(Member::getName)
                .orElse(post.getAuthorName());
        List<String> lines = new ArrayList<>();
        if (safeTitle(post.getTitle()) != null) {
            lines.add(safeTitle(post.getTitle()));
        }
        String contentPreview = auditTextPreview(post.getContent());
        if (contentPreview != null) {
            lines.add("content=" + contentPreview);
        }
        lines.add("author=" + auditIdentity(authorName, post.getAuthorStudentId()));
        lines.add("deletedBy=" + auditIdentity(deletedBy.getName(), deletedBy.getStudentId()));
        lines.add("deletedByRole=" + deletedBy.getRole().name());
        lines.add("category=" + post.getCategory().name());
        if (reason != null) {
            lines.add("reason=" + reason);
        }
        return String.join("\n", lines);
    }

    private String auditIdentity(String name, String studentId) {
        String safeName = name == null || name.isBlank() ? "-" : name.trim();
        String safeStudentId = studentId == null || studentId.isBlank() ? "-" : studentId.trim();
        return safeName + "(" + safeStudentId + ")";
    }

    private String auditTextPreview(String value) {
        String normalized = plainTextContent(value).replaceAll("\\s+", " ").trim();
        return normalized.isEmpty() ? null : preview(normalized);
    }

    private String normalizeDeleteReason(String reason) {
        String normalized = reason == null ? "" : reason.trim().replaceAll("\\s+", " ");
        if (normalized.isEmpty()) return null;
        if (normalized.length() > MAX_DELETE_REASON_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "삭제 사유는 " + MAX_DELETE_REASON_LENGTH + "자 이하로 입력해주세요.");
        }
        rejectUnsafeText(normalized);
        return normalized;
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

    private Map<Long, List<CommunityPostResponse.PollResult>> pollResults(List<CommunityPost> posts, String currentStudentId) {
        List<Long> postIds = posts.stream().map(CommunityPost::getId).filter(Objects::nonNull).toList();
        if (postIds.isEmpty()) return Map.of();
        Map<Long, List<PollDefinition>> definitions = posts.stream()
                .collect(Collectors.toMap(CommunityPost::getId, post -> pollDefinitions(post.getContent())));
        Map<Long, List<CommunityPollVote>> votesByPost = pollVoteRepository.findByPostIdIn(postIds).stream()
                .collect(Collectors.groupingBy(CommunityPollVote::getPostId));
        return definitions.entrySet().stream()
                .filter(entry -> !entry.getValue().isEmpty())
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().stream()
                        .map(definition -> pollResult(definition, votesByPost.getOrDefault(entry.getKey(), List.of()), currentStudentId))
                        .toList()));
    }

    private CommunityPostResponse.PollResult pollResult(PollDefinition definition, List<CommunityPollVote> votes, String currentStudentId) {
        List<Long> counts = new ArrayList<>(Collections.nCopies(definition.optionCount(), 0L));
        Integer myOption = null;
        for (CommunityPollVote vote : votes) {
            if (!definition.pollId().equals(vote.getPollId())) continue;
            int index = vote.getOptionIndex();
            if (index >= 0 && index < counts.size()) {
                counts.set(index, counts.get(index) + 1);
            }
            if (vote.getStudentId().equals(currentStudentId)) {
                myOption = index;
            }
        }
        return new CommunityPostResponse.PollResult(definition.pollId(), counts, myOption, definition.closesAt(), definition.closedAt(), definition.isClosed());
    }

    private List<PollDefinition> pollDefinitions(String content) {
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) return List.of();
            List<PollDefinition> polls = new ArrayList<>();
            for (JsonNode block : root) {
                if (!"poll".equals(block.path("type").asText())) continue;
                String pollId = block.path("pollId").asText("");
                int optionCount = block.path("options").isArray() ? block.path("options").size() : 0;
                if (!pollId.isBlank() && optionCount > 0) {
                    polls.add(new PollDefinition(pollId, optionCount, parseDate(block.path("closesAt").asText("")), parseDate(block.path("closedAt").asText(""))));
                }
            }
            return polls;
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String closePollInContent(String content, String pollId) {
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "투표를 찾을 수 없습니다.");
            }
            boolean found = false;
            ArrayNode next = JSON.createArrayNode();
            for (JsonNode block : root) {
                if (block.isObject() && "poll".equals(block.path("type").asText()) && pollId.equals(block.path("pollId").asText())) {
                    ObjectNode copy = ((ObjectNode) block).deepCopy();
                    copy.put("closedAt", LocalDateTime.now().toString());
                    next.add(copy);
                    found = true;
                } else {
                    next.add(block);
                }
            }
            if (!found) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "투표를 찾을 수 없습니다.");
            }
            return sanitizeCommunityContent(JSON.writeValueAsString(next));
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표를 종료할 수 없습니다.");
        }
    }

    private LocalDateTime parseDate(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return LocalDateTime.parse(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    @Transactional(readOnly = true)
    public List<CommunityCommentResponse> listComments(Long postId, String studentId) {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
        boolean isAdmin = member.getRole() == Member.Role.ADMIN;
        boolean maskAnonymous = isAnonymousPost(post) && !isAdmin;
        return commentRepository.findByPostIdOrderByCreatedAtAsc(postId).stream()
                .map(c -> new CommunityCommentResponse(
                        c.getId(), c.getPostId(), c.getParentCommentId(), c.getDepth(),
                        maskAnonymous ? anonymousDisplayName(c.getAnonymousName(), c.getIpAddress()) : displayName(c.getStudentId(), c.getAuthorName()), c.getContent(), c.getCreatedAt(), c.getUpdatedAt(), c.isEdited(),
                        isAdmin || c.getStudentId().equals(studentId)))
                .toList();
    }

    public CommunityCommentResponse addComment(Long postId, String studentId, CommunityCommentRequest request) {
        return addComment(postId, studentId, request, null);
    }

    public CommunityCommentResponse addComment(Long postId, String studentId, CommunityCommentRequest request, String clientIp) {
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        requirePostVisible(member, post);
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
        CommunityComment comment = new CommunityComment(postId, studentId, member.getName(), content, request.parentCommentId(), depth);
        applyAnonymousCommentFields(post, comment, request.anonymousName(), clientIp);
        CommunityComment saved = commentRepository.save(comment);
        if (parent == null) {
            notificationService.notifyPostComment(post, saved);
        } else {
            notificationService.notifyCommentReply(post, parent, saved);
        }
        auditLogService.record(member.getStudentId(), "COMMUNITY_COMMENT_CREATE", "COMMUNITY_COMMENT", String.valueOf(saved.getId()),
                "postId=" + postId + (saved.getParentCommentId() == null ? "" : ", parentCommentId=" + saved.getParentCommentId()), null);
        return new CommunityCommentResponse(saved.getId(), saved.getPostId(), saved.getParentCommentId(), saved.getDepth(), commentAuthorName(post, member, saved),
                saved.getContent(), saved.getCreatedAt(), saved.getUpdatedAt(), saved.isEdited(), true);
    }

    public CommunityCommentResponse updateComment(Long postId, Long commentId, String studentId, CommunityCommentRequest request) {
        CommunityComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!comment.getPostId().equals(postId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
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
                commentAuthorName(post, member, saved), saved.getContent(), saved.getCreatedAt(), saved.getUpdatedAt(), saved.isEdited(), true);
    }

    public void deleteComment(Long postId, Long commentId, String studentId) {
        CommunityComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!comment.getPostId().equals(postId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        CommunityPost post = communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requirePostVisible(member, post);
        if (!comment.getStudentId().equals(studentId) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        String detail = commentDeletionAuditDetail(post, comment, member);
        deleteCommentTree(comment);
        auditLogService.record(member.getStudentId(), "COMMUNITY_COMMENT_DELETE", "COMMUNITY_COMMENT", String.valueOf(commentId),
                detail, null);
    }

    private void deleteCommentTree(CommunityComment comment) {
        deleteCommentTree(comment, new java.util.HashSet<>());
    }

    private void deleteCommentTree(CommunityComment comment, Set<Long> deletedCommentIds) {
        if (!deletedCommentIds.add(comment.getId())) return;
        commentRepository.findByParentCommentId(comment.getId()).forEach(child -> deleteCommentTree(child, deletedCommentIds));
        commentRepository.delete(comment);
    }

    private String commentDeletionAuditDetail(CommunityPost post, CommunityComment comment, Member deletedBy) {
        List<String> lines = new ArrayList<>();
        lines.add("postId=" + post.getId());
        if (safeTitle(post.getTitle()) != null) {
            lines.add(safeTitle(post.getTitle()));
        }
        lines.add("author=" + auditIdentity(comment.getAuthorName(), comment.getStudentId()));
        lines.add("deletedBy=" + auditIdentity(deletedBy.getName(), deletedBy.getStudentId()));
        lines.add("deletedByRole=" + deletedBy.getRole().name());
        if (comment.getContent() != null && !comment.getContent().isBlank()) {
            lines.add("content=" + preview(comment.getContent().trim().replaceAll("\\s+", " ")));
        }
        return String.join("\n", lines);
    }

    private String commentAuthorName(CommunityPost post, Member currentMember, CommunityComment comment) {
        return isAnonymousPost(post) && currentMember.getRole() != Member.Role.ADMIN
                ? anonymousDisplayName(comment.getAnonymousName(), comment.getIpAddress())
                : displayName(comment.getStudentId(), comment.getAuthorName());
    }

    private void deletePostData(CommunityPost post) {
        deletePostData(post, Set.of());
    }

    private void deletePostData(CommunityPost post, Set<String> preservedStoredNames) {
        clearImage(post, preservedStoredNames);
        clearExtraImages(post.getId(), preservedStoredNames);
        pollVoteRepository.deleteByPostId(post.getId());
        voteRepository.deleteByPost(post);
        commentRepository.deleteByPostId(post.getId());
        communityPostRepository.delete(post);
    }

    private void deleteStoredFile(String storedName, Set<String> preservedStoredNames) {
        if (storedName == null || preservedStoredNames.contains(storedName) || deletionArchiveService.isArchivedStoredName(storedName)) {
            return;
        }
        storageService.delete(storedName);
    }

    private record PollDefinition(String pollId, int optionCount, LocalDateTime closesAt, LocalDateTime closedAt) {
        boolean isClosed() {
            return closedAt != null || (closesAt != null && !LocalDateTime.now().isBefore(closesAt));
        }
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

    public record CommunityPostSharePreview(Long id, String title, String description, boolean hasImage) {}

    public record CommunityPostShareImage(Resource resource, String originalName, String mimeType) {}
}
