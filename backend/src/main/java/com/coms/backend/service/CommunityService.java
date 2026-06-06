package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostImage;
import com.coms.backend.domain.CommunityPostVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityCommentResponse;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.Locale;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional
public class CommunityService {
    private static final int MAX_TITLE_LENGTH = 120;
    private static final int MAX_CONTENT_LENGTH = 5000;
    private static final int MAX_COMMENT_LENGTH = 1000;
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    private static final long CONCEPT_POST_SCORE_THRESHOLD = 5;
    private static final int MAX_EXTRA_IMAGES_PER_POST = 5;
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");

    private final CommunityPostRepository communityPostRepository;
    private final CommunityPostVoteRepository voteRepository;
    private final MemberRepository memberRepository;
    private final StorageService storageService;
    private final CommunityCommentRepository commentRepository;
    private final NotificationService notificationService;
    private final CommunityPostImageRepository imageRepository;

    public CommunityService(CommunityPostRepository communityPostRepository,
                            CommunityPostVoteRepository voteRepository,
                            MemberRepository memberRepository,
                            StorageService storageService,
                            CommunityCommentRepository commentRepository,
                            NotificationService notificationService,
                            CommunityPostImageRepository imageRepository) {
        this.communityPostRepository = communityPostRepository;
        this.voteRepository = voteRepository;
        this.memberRepository = memberRepository;
        this.commentRepository = commentRepository;
        this.storageService = storageService;
        this.notificationService = notificationService;
        this.imageRepository = imageRepository;
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
        return posts.stream()
                .map(post -> toResponse(post, member, authors.get(post.getAuthorStudentId()), stats, false))
                .toList();
    }

    public CommunityPostResponse get(String studentId, Long id) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        post.incrementViewCount();
        CommunityPost saved = communityPostRepository.save(post);
        return toResponse(saved, member, memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), true);
    }

    public CommunityPostResponse create(String studentId, CommunityPostRequest request, MultipartFile image) {
        Member member = findMember(studentId);
        SanitizedPost sanitized = validateRequest(request, null);
        CommunityPost post = new CommunityPost();
        post.setTitle(sanitized.title());
        post.setContent(sanitized.content());
        post.setCategory(sanitized.category());
        post.setAuthorStudentId(member.getStudentId());
        post.setAuthorName(member.getName());
        attachImage(post, image);
        CommunityPost saved = communityPostRepository.save(post);
        return toResponse(saved, member, member, voteStats(List.of(saved)), true);
    }

    public CommunityPostResponse update(String studentId, Long id, CommunityPostRequest request, MultipartFile image) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        SanitizedPost sanitized = validateRequest(request, post.getTitle());
        post.setContent(sanitized.content());
        post.setCategory(sanitized.category());
        if (request.removeImage()) {
            clearImage(post);
        }
        attachImage(post, image);
        post.markEdited();
        CommunityPost saved = communityPostRepository.save(post);
        return toResponse(saved, member,
                memberRepository.findByStudentId(saved.getAuthorStudentId()).orElse(null),
                voteStats(List.of(saved)), true);
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
        return toResponse(post, member, memberRepository.findByStudentId(post.getAuthorStudentId()).orElse(null),
                voteStats(List.of(post)), true);
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
        String content = normalizeBounded(request.content(), "내용", MAX_CONTENT_LENGTH);
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

    private CommunityPostResponse toResponse(CommunityPost post,
                                             Member currentMember,
                                             Member author,
                                             Map<Long, VoteSummary> voteStats,
                                             boolean includeContent) {
        boolean editable = post.getAuthorStudentId().equals(currentMember.getStudentId())
                || currentMember.getRole() == Member.Role.ADMIN;
        boolean authorAdmin = author != null && author.getRole() == Member.Role.ADMIN;
        String authorName = author != null ? author.getName() : post.getAuthorName();
        VoteSummary votes = voteStats.getOrDefault(post.getId(), VoteSummary.EMPTY);
        List<String> imageUrls = imageRepository.findByPostIdOrderByPositionAsc(post.getId())
                .stream()
                .map(img -> "/api/community/posts/" + post.getId() + "/images/" + img.getId())
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
                post.getViewCount(),
                votes.upvotes(),
                votes.downvotes(),
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
        return generation.isBlank() ? trimmedName : generation + trimmedName;
    }

    static String generationFromStudentId(String studentId) {
        if (studentId == null || !studentId.matches("\\d{10}")) {
            return "";
        }
        int admissionYear = Integer.parseInt(studentId.substring(0, 4));
        int generation = admissionYear - 1966;
        return generation > 0 ? generation + "기" : "";
    }

    public void addImages(String studentId, Long postId, List<MultipartFile> images) {
        if (images == null || images.isEmpty()) return;
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
                imageRepository.save(new CommunityPostImage(postId, stored, image.getOriginalFilename(), contentType, startPos + i));
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
            }
        }
    }

    public Resource loadExtraImage(Long postId, Long imageId) {
        CommunityPostImage img = imageRepository.findById(imageId)
                .filter(i -> i.getPostId().equals(postId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return storageService.load(img.getStoredName());
    }

    public String getExtraImageMimeType(Long postId, Long imageId) {
        return imageRepository.findById(imageId)
                .filter(i -> i.getPostId().equals(postId))
                .map(CommunityPostImage::getMimeType)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
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

    private SanitizedPost validateRequest(CommunityPostRequest request, String existingTitle) {
        String title = normalizeBounded(request.title(), "제목", MAX_TITLE_LENGTH);
        String content = normalizeBounded(request.content(), "내용", MAX_CONTENT_LENGTH);
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
    }

    private record SanitizedPost(String title, String content, CommunityPost.Category category) {}

    private String preview(String content) {
        if (content == null || content.length() <= 160) {
            return content;
        }
        return content.substring(0, 160);
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
                        c.getAuthorName(), c.getContent(), c.getCreatedAt(),
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
            if (parent.getDepth() >= 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Replies are limited to one nested level.");
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
        return new CommunityCommentResponse(saved.getId(), saved.getPostId(), saved.getParentCommentId(), saved.getDepth(), saved.getAuthorName(),
                saved.getContent(), saved.getCreatedAt(), true);
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
