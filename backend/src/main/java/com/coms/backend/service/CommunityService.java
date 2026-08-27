package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostBookmark;
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
import com.coms.backend.dto.CommunityReputationResponse;
import com.coms.backend.dto.YouTubeSearchResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostBookmarkRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.core.io.Resource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

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
import java.util.stream.Collectors;

/**
 * Orchestrates the community post aggregate: post CRUD and listing, votes, bookmarks, polls, share
 * previews and response assembly. Cohesive sub-domains live in collaborating services — comments
 * ({@link CommunityCommentService}), media attachments ({@link CommunityMediaService}), reputation
 * ({@link CommunityReputationService}), anonymous identity ({@link AnonymousIdentityService}),
 * text/sanitization ({@link CommunityTextService}), visibility/authz ({@link CommunityAccess}), and
 * YouTube search ({@link YouTubeSearchService}). This class keeps the stable public API the
 * controller and existing tests depend on, delegating the extracted concerns.
 */
@Service
@Transactional
public class CommunityService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_TITLE_LENGTH = 120;
    private static final int MAX_CONTENT_LENGTH = 50000;
    private static final int MAX_DELETE_REASON_LENGTH = 300;
    private static final long CONCEPT_POST_SCORE_THRESHOLD = 5;
    private static final int MAX_POSTS_PER_MINUTE = 5;
    private static final int MAX_SEARCH_QUERY_LENGTH = 100;

    private final CommunityPostRepository communityPostRepository;
    private final CommunityPostVoteRepository voteRepository;
    private final CommunityPostBookmarkRepository bookmarkRepository;
    private final MemberRepository memberRepository;
    private final CommunityCommentRepository commentRepository;
    private final CommunityPollVoteRepository pollVoteRepository;
    private final StorageService storageService;
    private final NotificationService notificationService;
    private final AuditLogService auditLogService;
    private final CommunityDeletionArchiveService deletionArchiveService;
    private final CommunityAccess access;
    private final CommunityTextService textService;
    private final AnonymousIdentityService anonymousIdentity;
    private final CommunityReputationService reputationService;
    private final CommunityMediaService mediaService;
    private final CommunityCommentService commentService;
    private final YouTubeSearchService youTubeSearchService;

    public CommunityService(CommunityPostRepository communityPostRepository,
                            CommunityPostVoteRepository voteRepository,
                            CommunityPostBookmarkRepository bookmarkRepository,
                            MemberRepository memberRepository,
                            CommunityCommentRepository commentRepository,
                            CommunityPollVoteRepository pollVoteRepository,
                            StorageService storageService,
                            NotificationService notificationService,
                            AuditLogService auditLogService,
                            CommunityDeletionArchiveService deletionArchiveService,
                            CommunityAccess access,
                            CommunityTextService textService,
                            AnonymousIdentityService anonymousIdentity,
                            CommunityReputationService reputationService,
                            CommunityMediaService mediaService,
                            CommunityCommentService commentService,
                            YouTubeSearchService youTubeSearchService) {
        this.communityPostRepository = communityPostRepository;
        this.voteRepository = voteRepository;
        this.bookmarkRepository = bookmarkRepository;
        this.memberRepository = memberRepository;
        this.commentRepository = commentRepository;
        this.pollVoteRepository = pollVoteRepository;
        this.storageService = storageService;
        this.notificationService = notificationService;
        this.auditLogService = auditLogService;
        this.deletionArchiveService = deletionArchiveService;
        this.access = access;
        this.textService = textService;
        this.anonymousIdentity = anonymousIdentity;
        this.reputationService = reputationService;
        this.mediaService = mediaService;
        this.commentService = commentService;
        this.youTubeSearchService = youTubeSearchService;
    }

    // ---- Post listing --------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<CommunityPostResponse> list(String studentId) {
        Member member = access.requireMember(studentId);
        List<CommunityPost> posts = communityPostRepository.findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc().stream()
                .filter(post -> access.canView(member, post))
                .toList();
        return mapPosts(posts, member, null);
    }

    @Transactional(readOnly = true)
    public List<CommunityPostResponse> listBookmarked(String studentId) {
        Member member = access.requireMember(studentId);
        List<CommunityPost> posts = bookmarkRepository.findBookmarkedPostsByStudentId(member.getStudentId()).stream()
                .filter(Objects::nonNull)
                .filter(post -> access.canView(member, post))
                .toList();
        // Every post in this list is bookmarked by definition, so skip the per-row existence check.
        return mapPosts(posts, member, Boolean.TRUE);
    }

    @Transactional(readOnly = true)
    public List<CommunityPostResponse> listByAuthor(String authorStudentId, String viewerStudentId) {
        Member member = access.requireMember(viewerStudentId);
        List<CommunityPost> posts = communityPostRepository.findByAuthorStudentIdOrderByCreatedAtDesc(authorStudentId).stream()
                .filter(post -> !access.isAnonymous(post))
                .filter(post -> access.canView(member, post))
                .toList();
        return mapPosts(posts, member, null);
    }

    /**
     * Returns at most {@code limit} posts visible to the viewer, in the same order as {@link #list(String)},
     * used by the mobile home preview. Bounds the query instead of loading every row and trimming in memory.
     * A bounded window is fetched (a small multiple of {@code limit}) so the per-viewer visibility filter
     * still has enough candidates to fill {@code limit} entries without scanning the whole table.
     */
    @Transactional(readOnly = true)
    public List<CommunityPostResponse> listLimited(String studentId, int limit) {
        Member member = access.requireMember(studentId);
        int window = Math.max(limit * 4, limit);
        List<CommunityPost> posts = communityPostRepository
                .findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc(PageRequest.of(0, window))
                .stream()
                .filter(post -> access.canView(member, post))
                .limit(limit)
                .toList();
        return mapPosts(posts, member, null);
    }

    /**
     * Real DB-paginated variant of {@link #list(String)} for the {@code page}/{@code size} query
     * params on {@code GET /api/community/posts}: fetches only the requested page (plus a matching
     * COUNT) instead of loading and mapping every post before slicing in memory. The per-viewer
     * anonymous-post visibility rule collapses to a single boolean (can this viewer see ANONYMOUS
     * posts at all?) that doesn't depend on any other post field, so it moves into the query instead
     * of a post-fetch Java filter.
     */
    @Transactional(readOnly = true)
    public PagedPosts listPaged(String studentId, int page, int size) {
        Member member = access.requireMember(studentId);
        Pageable pageable = PageRequest.of(page, size);
        List<CommunityPost> posts;
        long total;
        if (access.canSeeAnonymous(member)) {
            posts = communityPostRepository.findAllByOrderByPinnedDescPinnedAtDescCreatedAtDescIdDesc(pageable);
            total = communityPostRepository.count();
        } else {
            posts = communityPostRepository.findByCategoryNotOrderByPinnedDescPinnedAtDescCreatedAtDescIdDesc(
                    CommunityPost.Category.ANONYMOUS, pageable);
            total = communityPostRepository.countByCategoryNot(CommunityPost.Category.ANONYMOUS);
        }
        return new PagedPosts(mapPosts(posts, member, null), total);
    }

    public record PagedPosts(List<CommunityPostResponse> items, long total) {}

    /**
     * Keyword search over post title/content with real DB-side pagination, honouring the same
     * visibility rules as {@link #listPaged}: a viewer who can't see ANONYMOUS posts has them
     * excluded in SQL. The query is trimmed and length-capped, and LIKE metacharacters are escaped so
     * user input can't inject wildcards; a blank query short-circuits to an empty page.
     */
    @Transactional(readOnly = true)
    public PagedPosts searchPaged(String studentId, String query, int page, int size) {
        Member member = access.requireMember(studentId);
        String keyword = query == null ? "" : query.trim();
        if (keyword.isEmpty()) {
            return new PagedPosts(List.of(), 0);
        }
        if (keyword.length() > MAX_SEARCH_QUERY_LENGTH) {
            keyword = keyword.substring(0, MAX_SEARCH_QUERY_LENGTH);
        }
        String escaped = escapeLikePattern(keyword);
        Pageable pageable = PageRequest.of(page, size);
        org.springframework.data.domain.Page<CommunityPost> result = access.canSeeAnonymous(member)
                ? communityPostRepository.searchByKeyword(escaped, pageable)
                : communityPostRepository.searchByKeywordExcludingCategory(escaped, CommunityPost.Category.ANONYMOUS, pageable);
        return new PagedPosts(mapPosts(result.getContent(), member, null), result.getTotalElements());
    }

    /** Escapes LIKE metacharacters against the {@code '!'} escape char used by the search queries. */
    private static String escapeLikePattern(String value) {
        return value.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private List<CommunityPostResponse> mapPosts(List<CommunityPost> posts, Member member, Boolean bookmarkedOverride) {
        Map<String, Member> authors = authorsByStudentId(posts);
        Map<Long, VoteSummary> stats = voteStats(posts);
        Map<Long, Long> commentCounts = commentCounts(posts);
        Map<Long, List<CommunityPostResponse.PollResult>> pollResults = pollResults(posts, member.getStudentId());
        Map<String, CommunityReputationResponse> reputations = reputationService.reputationTiers(authors.keySet());
        Map<Long, List<CommunityPostImage>> images = mediaService.imagesByPost(posts);
        Map<Long, List<CommunityPostVideo>> videos = mediaService.videosByPost(posts);
        Map<Long, List<CommunityPostFile>> files = mediaService.filesByPost(posts);
        // Skip the batched bookmark lookup when every post's bookmarked state is already known
        // (e.g. listBookmarked, where bookmarkedOverride pins it to true for the whole page).
        Set<Long> bookmarked = bookmarkedOverride == null ? bookmarkedPostIds(posts, member.getStudentId()) : Set.of();
        return posts.stream()
                .map(post -> toResponse(post, member, authors.get(post.getAuthorStudentId()), stats, commentCounts, pollResults, reputations,
                        false, bookmarkedOverride, images, videos, files, bookmarked))
                .toList();
    }

    private Map<String, Member> authorsByStudentId(List<CommunityPost> posts) {
        return memberRepository.findByStudentIdIn(posts.stream()
                        .map(CommunityPost::getAuthorStudentId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(Member::getStudentId, Function.identity()));
    }

    // ---- Single-post reads ---------------------------------------------------------------------

    public CommunityPostResponse get(String studentId, Long id) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(id);
        access.requireVisible(member, post);
        communityPostRepository.incrementViewCount(post.getId());
        // The atomic update cleared the persistence context; re-read to render the fresh count.
        CommunityPost saved = requirePost(id);
        return toResponse(saved, member, memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    // ---- Post mutations ------------------------------------------------------------------------

    public CommunityPostResponse create(String studentId, CommunityPostRequest request, MultipartFile image) {
        return create(studentId, request, image, null);
    }

    public CommunityPostResponse create(String studentId, CommunityPostRequest request, MultipartFile image, String clientIp) {
        Member member = access.requireMember(studentId);
        enforcePostRateLimit(member.getStudentId());
        SanitizedPost sanitized = validateRequest(request);
        access.requireCategoryAllowed(member, sanitized.category());
        CommunityPost post = new CommunityPost();
        post.setTitle(sanitized.title());
        post.setContent(sanitized.content());
        post.setCategory(sanitized.category());
        post.setAuthorStudentId(member.getStudentId());
        post.setAuthorName(member.getName());
        applyAnonymousPostFields(post, sanitized.category(), request.anonymousName(), clientIp);
        mediaService.attachImage(post, image);
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_CREATE", "COMMUNITY_POST", String.valueOf(saved.getId()), textService.safeTitle(saved.getTitle()), null);
        return toResponse(saved, member, member, voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    public CommunityPostResponse update(String studentId, Long id, CommunityPostRequest request, MultipartFile image) {
        return update(studentId, id, request, image, null);
    }

    public CommunityPostResponse update(String studentId, Long id, CommunityPostRequest request, MultipartFile image, String clientIp) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(id);
        access.requireVisible(member, post);
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && !access.isModerator(member)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        SanitizedPost sanitized = validateRequest(request);
        access.requireCategoryAllowed(member, sanitized.category());
        boolean titleChanged = !sanitized.title().equals(post.getTitle());
        boolean isInitialFinalization = isInitialFinalization(post, sanitized.content());
        boolean wasAnonymous = access.isAnonymous(post);
        post.setTitle(sanitized.title());
        post.setContent(sanitized.content());
        post.setCategory(sanitized.category());
        preserveAnonymousPostFields(post, wasAnonymous, sanitized.category(), request.anonymousName(), clientIp);
        if (Boolean.TRUE.equals(request.removeImage())) {
            mediaService.clearImage(post);
        }
        mediaService.attachImage(post, image);
        if (titleChanged || !isInitialFinalization) {
            post.markEdited();
        }
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_UPDATE", "COMMUNITY_POST", String.valueOf(saved.getId()), textService.safeTitle(saved.getTitle()), null);
        return toResponse(saved, member,
                memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    public CommunityPostResponse setPinned(String studentId, Long id, boolean pinned) {
        Member member = access.requireMember(studentId);
        if (!access.isModerator(member)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        CommunityPost post = requirePost(id);
        post.setPinned(pinned);
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_PIN", "COMMUNITY_POST", String.valueOf(saved.getId()), "pinned=" + pinned, null);
        return toResponse(saved, member,
                memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    public void delete(String studentId, Long id) {
        delete(studentId, id, null);
    }

    public void delete(String studentId, Long id, String reason) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(id);
        access.requireVisible(member, post);
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && !access.isModerator(member)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        String normalizedReason = textService.normalizeDeleteReason(reason, MAX_DELETE_REASON_LENGTH);
        if (access.isModerator(member)
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

    // ---- Votes & bookmarks ---------------------------------------------------------------------

    public CommunityPostResponse vote(String studentId, Long id, int value) {
        if (value < -1 || value > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid vote value.");
        }
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(id);
        access.requireVisible(member, post);
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
            try {
                voteRepository.saveAndFlush(vote);
            } catch (DataIntegrityViolationException e) {
                // A concurrent request (double-click / retry) already inserted this member's vote and
                // tripped the unique constraint. Converge on the requested value instead of 500ing.
                voteRepository.findByPostAndStudentId(post, member.getStudentId()).ifPresent(existingVote -> {
                    existingVote.setValue(value);
                    voteRepository.save(existingVote);
                });
            }
        }
        auditLogService.record(member.getStudentId(), "COMMUNITY_POST_VOTE", "COMMUNITY_POST", String.valueOf(post.getId()), "value=" + value, null);
        return toResponse(post, member, memberRepository.findByStudentId(post.getAuthorStudentId()).orElse(null),
                voteStats(List.of(post)), commentCounts(List.of(post)), pollResults(List.of(post), member.getStudentId()), true);
    }

    public boolean toggleBookmark(Long postId, String studentId) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireVisible(member, post);
        if (bookmarkRepository.existsByPostIdAndStudentId(post.getId(), member.getStudentId())) {
            bookmarkRepository.deleteByPostIdAndStudentId(post.getId(), member.getStudentId());
            return false;
        }
        CommunityPostBookmark bookmark = new CommunityPostBookmark();
        bookmark.setPost(post);
        bookmark.setStudentId(member.getStudentId());
        try {
            bookmarkRepository.saveAndFlush(bookmark);
        } catch (DataIntegrityViolationException e) {
            // A concurrent request already inserted the same (post, student) bookmark and tripped the
            // unique constraint. Treat it as success and report the actual post-operation DB state.
            return bookmarkRepository.existsByPostIdAndStudentId(post.getId(), member.getStudentId());
        }
        return true;
    }

    // ---- Polls ---------------------------------------------------------------------------------

    public CommunityPostResponse votePoll(String studentId, Long id, CommunityPollVoteRequest request) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(id);
        access.requireVisible(member, post);
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
            try {
                pollVoteRepository.saveAndFlush(vote);
            } catch (DataIntegrityViolationException e) {
                // Two concurrent submissions both passed the existence check above; the unique
                // constraint rejected the loser. Surface the same intended message, not a 500.
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 투표했습니다. 투표는 변경하거나 취소할 수 없습니다.");
            }
        }
        auditLogService.record(member.getStudentId(), "COMMUNITY_POLL_VOTE", "COMMUNITY_POST", String.valueOf(post.getId()), "pollId=" + poll.pollId(), null);
        return toResponse(post, member, memberRepository.findByStudentId(post.getAuthorStudentId()).orElse(null),
                voteStats(List.of(post)), commentCounts(List.of(post)), pollResults(List.of(post), member.getStudentId()), true);
    }

    public CommunityPostResponse closePoll(String studentId, Long id, String pollId) {
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(id);
        access.requireVisible(member, post);
        access.requireOwnerOrAdmin(post, member);
        String closedContent = closePollInContent(post.getContent(), pollId);
        post.setContent(closedContent);
        CommunityPost saved = communityPostRepository.save(post);
        auditLogService.record(member.getStudentId(), "COMMUNITY_POLL_CLOSE", "COMMUNITY_POST", String.valueOf(post.getId()), "pollId=" + pollId, null);
        return toResponse(saved, member, memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), commentCounts(List.of(saved)), pollResults(List.of(saved), member.getStudentId()), true);
    }

    // ---- YouTube search (delegated) ------------------------------------------------------------

    @Transactional(readOnly = true)
    public YouTubeSearchResponse searchYouTube(String query) {
        return youTubeSearchService.search(query);
    }

    // ---- Member data erasure -------------------------------------------------------------------

    public void deleteCommunityDataForMember(String studentId) {
        if (studentId == null || studentId.isBlank()) return;
        List<CommunityPost> posts = communityPostRepository.findByAuthorStudentId(studentId);
        posts.forEach(this::deletePostData);
        pollVoteRepository.deleteByStudentId(studentId);
        voteRepository.deleteByStudentId(studentId);
        bookmarkRepository.deleteByStudentId(studentId);
        commentService.deleteCommentsByAuthor(studentId);
    }

    // ---- Cover image serving -------------------------------------------------------------------

    @Transactional(readOnly = true)
    public CommunityPost imagePost(Long id) {
        CommunityPost post = requirePost(id);
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

    // ---- Share previews ------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public CommunityPostSharePreview sharePreview(Long id) {
        CommunityPost post = requirePost(id);
        if (access.isAnonymous(post)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return new CommunityPostSharePreview(
                post.getId(),
                post.getTitle(),
                textService.shareDescription(post.getContent()),
                mediaService.hasShareImage(post)
        );
    }

    @Transactional(readOnly = true)
    public CommunityPostShareImage loadShareImage(Long id) {
        CommunityPost post = requirePost(id);
        if (access.isAnonymous(post)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Optional<CommunityPostImage> contentImage = mediaService.firstShareImage(post);
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
        Member member = access.requireMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireVisible(member, post);
    }

    // ---- Reputation (delegated) ----------------------------------------------------------------

    @Transactional(readOnly = true)
    public CommunityReputationResponse reputation(String viewerStudentId, String targetStudentId) {
        return reputationService.reputation(viewerStudentId, targetStudentId);
    }

    // ---- Media attachments (delegated) ---------------------------------------------------------

    public List<Long> addImages(String studentId, Long postId, List<MultipartFile> images) {
        return mediaService.addImages(studentId, postId, images);
    }

    public void deleteImage(String studentId, Long postId, Long imageId) {
        mediaService.deleteImage(studentId, postId, imageId);
    }

    public Long addVideo(String studentId, Long postId, MultipartFile video) {
        return mediaService.addVideo(studentId, postId, video);
    }

    public Long addFile(String studentId, Long postId, MultipartFile file) {
        return mediaService.addFile(studentId, postId, file);
    }

    public void deleteVideo(String studentId, Long postId, Long videoId) {
        mediaService.deleteVideo(studentId, postId, videoId);
    }

    public CommunityPostVideo loadVideoMeta(Long postId, Long videoId) {
        return mediaService.loadVideoMeta(postId, videoId);
    }

    public Resource loadVideo(Long postId, Long videoId) {
        return mediaService.loadVideo(postId, videoId);
    }

    public CommunityPostFile loadFileMeta(Long postId, Long fileId) {
        return mediaService.loadFileMeta(postId, fileId);
    }

    public Resource loadFile(Long postId, Long fileId) {
        return mediaService.loadFile(postId, fileId);
    }

    public Resource loadExtraImage(Long postId, Long imageId) {
        return mediaService.loadExtraImage(postId, imageId);
    }

    public CommunityPostImage loadExtraImageMeta(Long postId, Long imageId) {
        return mediaService.loadExtraImageMeta(postId, imageId);
    }

    public String getExtraImageMimeType(Long postId, Long imageId) {
        return mediaService.getExtraImageMimeType(postId, imageId);
    }

    // ---- Comments (delegated) ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<CommunityCommentResponse> listComments(Long postId, String studentId) {
        return commentService.listComments(postId, studentId);
    }

    public CommunityCommentResponse addComment(Long postId, String studentId, CommunityCommentRequest request) {
        return commentService.addComment(postId, studentId, request);
    }

    public CommunityCommentResponse addComment(Long postId, String studentId, CommunityCommentRequest request, String clientIp) {
        return commentService.addComment(postId, studentId, request, clientIp);
    }

    public CommunityCommentResponse updateComment(Long postId, Long commentId, String studentId, CommunityCommentRequest request) {
        return commentService.updateComment(postId, commentId, studentId, request);
    }

    public void deleteComment(Long postId, Long commentId, String studentId) {
        commentService.deleteComment(postId, commentId, studentId);
    }

    // ---- Validation & anonymous post fields ----------------------------------------------------

    private SanitizedPost validateRequest(CommunityPostRequest request) {
        String title = textService.normalizeBounded(request.title(), "제목", MAX_TITLE_LENGTH);
        String content = textService.sanitizeContent(textService.normalizeBounded(request.content(), "내용", MAX_CONTENT_LENGTH));
        textService.rejectUnsafeText(title);
        textService.rejectUnsafeText(content);
        return new SanitizedPost(title, content, parseCategory(request.category()));
    }

    private void applyAnonymousPostFields(CommunityPost post, CommunityPost.Category category, String anonymousName, String clientIp) {
        if (category != CommunityPost.Category.ANONYMOUS) {
            post.setAnonymousName(null);
            post.setIpAddress(null);
            return;
        }
        post.setAnonymousName(anonymousIdentity.normalizeAnonymousName(anonymousName));
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

    private void enforcePostRateLimit(String studentId) {
        LocalDateTime windowStart = LocalDateTime.now().minusMinutes(1);
        long recentPostCount = communityPostRepository.countByAuthorStudentIdAndCreatedAtAfter(studentId, windowStart);
        if (recentPostCount >= MAX_POSTS_PER_MINUTE) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "게시글은 1분에 최대 " + MAX_POSTS_PER_MINUTE + "개까지 작성할 수 있습니다.");
        }
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
                    return currentContent.equals(textService.stripHtml(block.path("content").asText("")).trim());
                }
            }
            return false;
        } catch (Exception ignored) {
            return false;
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

    private record SanitizedPost(String title, String content, CommunityPost.Category category) {}

    // ---- Deletion internals & audit ------------------------------------------------------------

    private String deletionAuditDetail(CommunityPost post, Member deletedBy, String reason) {
        String authorName = memberRepository.findByStudentId(post.getAuthorStudentId())
                .map(Member::getName)
                .orElse(post.getAuthorName());
        List<String> lines = new ArrayList<>();
        if (textService.safeTitle(post.getTitle()) != null) {
            lines.add(textService.safeTitle(post.getTitle()));
        }
        String contentPreview = textService.auditTextPreview(post.getContent());
        if (contentPreview != null) {
            lines.add("content=" + contentPreview);
        }
        lines.add("author=" + textService.auditIdentity(authorName, post.getAuthorStudentId()));
        lines.add("deletedBy=" + textService.auditIdentity(deletedBy.getName(), deletedBy.getStudentId()));
        lines.add("deletedByRole=" + deletedBy.getRole().name());
        lines.add("category=" + post.getCategory().name());
        if (reason != null) {
            lines.add("reason=" + reason);
        }
        return String.join("\n", lines);
    }

    private void deletePostData(CommunityPost post) {
        deletePostData(post, Set.of());
    }

    private void deletePostData(CommunityPost post, Set<String> preservedStoredNames) {
        mediaService.clearImage(post, preservedStoredNames);
        mediaService.clearExtraMedia(post.getId(), preservedStoredNames);
        pollVoteRepository.deleteByPostId(post.getId());
        voteRepository.deleteByPost(post);
        bookmarkRepository.deleteByPostId(post.getId());
        commentRepository.deleteByPostId(post.getId());
        communityPostRepository.delete(post);
    }

    // ---- Poll parsing --------------------------------------------------------------------------

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
            return textService.sanitizeContent(JSON.writeValueAsString(next));
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

    // ---- Response assembly ---------------------------------------------------------------------

    private Map<Long, Long> commentCounts(List<CommunityPost> posts) {
        List<Long> postIds = postIds(posts);
        if (postIds.isEmpty()) {
            return Map.of();
        }
        return commentRepository.countByPostIds(postIds).stream()
                .collect(Collectors.toMap(CommunityCommentRepository.CommentCount::getPostId, CommunityCommentRepository.CommentCount::getCount));
    }

    private Set<Long> bookmarkedPostIds(List<CommunityPost> posts, String studentId) {
        List<Long> postIds = postIds(posts);
        if (postIds.isEmpty()) {
            return Set.of();
        }
        return bookmarkRepository.findByPostIdInAndStudentId(postIds, studentId).stream()
                .map(bookmark -> bookmark.getPost().getId())
                .collect(Collectors.toSet());
    }

    private Map<Long, VoteSummary> voteStats(List<CommunityPost> posts) {
        List<Long> postIds = postIds(posts);
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
        List<Long> postIds = postIds(posts);
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

    private CommunityPostResponse toResponse(CommunityPost post,
                                             Member currentMember,
                                             Member author,
                                             Map<Long, VoteSummary> voteStats,
                                             Map<Long, Long> commentCounts,
                                             Map<Long, List<CommunityPostResponse.PollResult>> pollResults,
                                             boolean includeContent) {
        return toResponse(post, currentMember, author, voteStats, commentCounts, pollResults,
                reputationService.reputationTiers(author == null ? Set.of() : Set.of(author.getStudentId())), includeContent);
    }

    private CommunityPostResponse toResponse(CommunityPost post,
                                             Member currentMember,
                                             Member author,
                                             Map<Long, VoteSummary> voteStats,
                                             Map<Long, Long> commentCounts,
                                             Map<Long, List<CommunityPostResponse.PollResult>> pollResults,
                                             Map<String, CommunityReputationResponse> reputations,
                                             boolean includeContent) {
        return toResponse(post, currentMember, author, voteStats, commentCounts, pollResults, reputations,
                includeContent, null, null, null, null, null);
    }

    /**
     * Full response assembly. {@code imagesByPost}/{@code videosByPost}/{@code filesByPost}/
     * {@code bookmarkedPostIds} are batch-prefetched maps for list responses; when {@code null}
     * (single-post callers) each falls back to the original per-post repository query, so that path
     * is unchanged.
     */
    private CommunityPostResponse toResponse(CommunityPost post,
                                             Member currentMember,
                                             Member author,
                                             Map<Long, VoteSummary> voteStats,
                                             Map<Long, Long> commentCounts,
                                             Map<Long, List<CommunityPostResponse.PollResult>> pollResults,
                                             Map<String, CommunityReputationResponse> reputations,
                                             boolean includeContent,
                                             Boolean bookmarkedOverride,
                                             Map<Long, List<CommunityPostImage>> imagesByPost,
                                             Map<Long, List<CommunityPostVideo>> videosByPost,
                                             Map<Long, List<CommunityPostFile>> filesByPost,
                                             Set<Long> bookmarkedPostIds) {
        boolean editable = post.getAuthorStudentId().equals(currentMember.getStudentId())
                || access.isModerator(currentMember);
        boolean maskAnonymous = access.isAnonymous(post) && !access.isModerator(currentMember);
        boolean authorAdmin = !maskAnonymous && author != null && author.getRole() == Member.Role.ADMIN;
        CommunityReputationResponse authorReputation = maskAnonymous ? null
                : reputations.get(post.getAuthorStudentId());
        String authorTier = authorReputation == null ? null : authorReputation.tier();
        String authorTierLabel = authorReputation == null ? null : authorReputation.tierLabel();
        String anonymousDisplay = anonymousIdentity.anonymousDisplayName(post.getAnonymousName(), post.getIpAddress());
        String authorName = maskAnonymous ? anonymousDisplay : (author != null ? author.getName() : post.getAuthorName());
        String authorStudentId = maskAnonymous ? null : post.getAuthorStudentId();
        String authorDisplayName = maskAnonymous ? anonymousDisplay : CommunityDisplayNames.displayName(post.getAuthorStudentId(), authorName);
        VoteSummary votes = voteStats.getOrDefault(post.getId(), VoteSummary.EMPTY);
        long commentCount = commentCounts.getOrDefault(post.getId(), 0L);
        List<CommunityPostImage> extraImages = imagesByPost != null
                ? imagesByPost.getOrDefault(post.getId(), List.of())
                : mediaService.imagesForPost(post.getId());
        List<String> imageUrls = extraImages.stream()
                .map(img -> "/api/community/posts/" + post.getId() + "/images/" + img.getId())
                .toList();
        List<CommunityPostResponse.MediaInfo> imageInfos = extraImages.stream()
                .map(img -> new CommunityPostResponse.MediaInfo(
                        img.getId(),
                        "/api/community/posts/" + post.getId() + "/images/" + img.getId(),
                        img.getOriginalName()))
                .toList();
        List<CommunityPostVideo> videos = videosByPost != null
                ? videosByPost.getOrDefault(post.getId(), List.of())
                : mediaService.videosForPost(post.getId());
        List<CommunityPostResponse.MediaInfo> videoInfos = videos.stream()
                .map(vid -> new CommunityPostResponse.MediaInfo(
                        vid.getId(),
                        "/api/community/posts/" + post.getId() + "/videos/" + vid.getId(),
                        vid.getOriginalName()))
                .toList();
        List<CommunityPostFile> files = filesByPost != null
                ? filesByPost.getOrDefault(post.getId(), List.of())
                : mediaService.filesForPost(post.getId());
        List<CommunityPostResponse.MediaInfo> fileInfos = files.stream()
                .map(file -> new CommunityPostResponse.MediaInfo(
                        file.getId(),
                        "/api/community/posts/" + post.getId() + "/files/" + file.getId() + "/download",
                        file.getOriginalName()))
                .toList();
        boolean bookmarked = bookmarkedOverride != null
                ? bookmarkedOverride
                : bookmarkedPostIds != null
                        ? bookmarkedPostIds.contains(post.getId())
                        : bookmarkRepository.existsByPostIdAndStudentId(post.getId(), currentMember.getStudentId());
        return new CommunityPostResponse(
                post.getId(),
                post.getTitle(),
                includeContent ? post.getContent() : preview(post.getContent()),
                authorStudentId,
                authorName,
                authorDisplayName,
                access.isAnonymous(post) ? post.getAnonymousName() : null,
                authorAdmin,
                authorTier,
                authorTierLabel,
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
                editable,
                post.isPinned(),
                bookmarked
        );
    }

    private String preview(String content) {
        return textService.preview(content);
    }

    private CommunityPost requirePost(Long id) {
        return communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static List<Long> postIds(List<CommunityPost> posts) {
        return posts.stream().map(CommunityPost::getId).filter(Objects::nonNull).toList();
    }

    // Retained as static entry points because existing tests reference them directly.
    static String displayName(String studentId, String name) {
        return CommunityDisplayNames.displayName(studentId, name);
    }

    static String generationFromStudentId(String studentId) {
        return CommunityDisplayNames.generationFromStudentId(studentId);
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
