package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityCommentResponse;
import com.coms.backend.dto.CommunityReputationResponse;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Owns community post comments: threaded creation/edit/delete, listing with author masking for
 * anonymous posts, and cascade deletion of reply trees. Delegates visibility to {@link CommunityAccess},
 * masking to {@link AnonymousIdentityService}, badges to {@link CommunityReputationService}, and text
 * safety to {@link CommunityTextService}.
 */
@Service
@Transactional
class CommunityCommentService {
    private static final int MAX_COMMENT_LENGTH = 1000;

    private final CommunityCommentRepository commentRepository;
    private final CommunityPostRepository communityPostRepository;
    private final NotificationService notificationService;
    private final AuditLogService auditLogService;
    private final CommunityAccess access;
    private final AnonymousIdentityService anonymousIdentity;
    private final CommunityReputationService reputationService;
    private final CommunityTextService textService;

    CommunityCommentService(CommunityCommentRepository commentRepository,
                            CommunityPostRepository communityPostRepository,
                            NotificationService notificationService,
                            AuditLogService auditLogService,
                            CommunityAccess access,
                            AnonymousIdentityService anonymousIdentity,
                            CommunityReputationService reputationService,
                            CommunityTextService textService) {
        this.commentRepository = commentRepository;
        this.communityPostRepository = communityPostRepository;
        this.notificationService = notificationService;
        this.auditLogService = auditLogService;
        this.access = access;
        this.anonymousIdentity = anonymousIdentity;
        this.reputationService = reputationService;
        this.textService = textService;
    }

    @Transactional(readOnly = true)
    public List<CommunityCommentResponse> listComments(Long postId, String studentId) {
        Member member = access.requireAuthenticatedMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireVisible(member, post);
        boolean isAdmin = member.getRole() == Member.Role.ADMIN;
        boolean maskAnonymous = access.isAnonymous(post) && !isAdmin;
        List<CommunityComment> comments = commentRepository.findByPostIdOrderByCreatedAtAsc(postId);
        Map<String, CommunityReputationResponse> reputations = maskAnonymous ? Map.of()
                : reputationService.reputationTiers(comments.stream().map(CommunityComment::getStudentId).filter(Objects::nonNull).collect(Collectors.toSet()));
        return comments.stream()
                .map(c -> {
                    CommunityReputationResponse reputation = maskAnonymous ? null : reputations.get(c.getStudentId());
                    return new CommunityCommentResponse(
                            c.getId(), c.getPostId(), c.getParentCommentId(), c.getDepth(),
                            maskAnonymous ? anonymousIdentity.anonymousDisplayName(c.getAnonymousName(), c.getIpAddress()) : CommunityDisplayNames.displayName(c.getStudentId(), c.getAuthorName()),
                            reputation == null ? null : reputation.tier(),
                            reputation == null ? null : reputation.tierLabel(),
                            c.getContent(), c.getCreatedAt(), c.getUpdatedAt(), c.isEdited(),
                            isAdmin || c.getStudentId().equals(studentId));
                })
                .toList();
    }

    public CommunityCommentResponse addComment(Long postId, String studentId, CommunityCommentRequest request) {
        return addComment(postId, studentId, request, null);
    }

    public CommunityCommentResponse addComment(Long postId, String studentId, CommunityCommentRequest request, String clientIp) {
        CommunityPost post = requirePost(postId);
        Member member = access.requireAuthenticatedMember(studentId);
        access.requireVisible(member, post);
        String content = textService.normalizeBounded(request.content(), "댓글", MAX_COMMENT_LENGTH);
        textService.rejectUnsafeText(content);
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
        return toCommentResponse(post, member, saved, true);
    }

    public CommunityCommentResponse updateComment(Long postId, Long commentId, String studentId, CommunityCommentRequest request) {
        CommunityComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!comment.getPostId().equals(postId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Member member = access.requireAuthenticatedMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireVisible(member, post);
        if (!comment.getStudentId().equals(studentId) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        String content = textService.normalizeBounded(request.content(), "댓글", MAX_COMMENT_LENGTH);
        textService.rejectUnsafeText(content);
        comment.markEdited(content);
        CommunityComment saved = commentRepository.save(comment);
        auditLogService.record(member.getStudentId(), "COMMUNITY_COMMENT_UPDATE", "COMMUNITY_COMMENT", String.valueOf(saved.getId()),
                "postId=" + postId, null);
        return toCommentResponse(post, member, saved, true);
    }

    public void deleteComment(Long postId, Long commentId, String studentId) {
        CommunityComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!comment.getPostId().equals(postId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Member member = access.requireAuthenticatedMember(studentId);
        CommunityPost post = requirePost(postId);
        access.requireVisible(member, post);
        if (!comment.getStudentId().equals(studentId) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        String detail = commentDeletionAuditDetail(post, comment, member);
        deleteCommentTree(comment);
        auditLogService.record(member.getStudentId(), "COMMUNITY_COMMENT_DELETE", "COMMUNITY_COMMENT", String.valueOf(commentId),
                detail, null);
    }

    /** Removes every comment authored by the member, cascading to their reply trees. */
    void deleteCommentsByAuthor(String studentId) {
        Set<Long> deletedCommentIds = new java.util.HashSet<>();
        commentRepository.findByStudentId(studentId).forEach(comment -> deleteCommentTree(comment, deletedCommentIds));
    }

    private CommunityCommentResponse toCommentResponse(CommunityPost post, Member currentMember, CommunityComment comment, boolean deletable) {
        boolean maskAnonymous = access.isAnonymous(post) && currentMember.getRole() != Member.Role.ADMIN;
        CommunityReputationResponse reputation = maskAnonymous ? null
                : reputationService.reputationTiers(Set.of(comment.getStudentId())).get(comment.getStudentId());
        return new CommunityCommentResponse(
                comment.getId(), comment.getPostId(), comment.getParentCommentId(), comment.getDepth(),
                commentAuthorName(post, currentMember, comment),
                reputation == null ? null : reputation.tier(),
                reputation == null ? null : reputation.tierLabel(),
                comment.getContent(), comment.getCreatedAt(), comment.getUpdatedAt(), comment.isEdited(), deletable);
    }

    private String commentAuthorName(CommunityPost post, Member currentMember, CommunityComment comment) {
        return access.isAnonymous(post) && currentMember.getRole() != Member.Role.ADMIN
                ? anonymousIdentity.anonymousDisplayName(comment.getAnonymousName(), comment.getIpAddress())
                : CommunityDisplayNames.displayName(comment.getStudentId(), comment.getAuthorName());
    }

    private void applyAnonymousCommentFields(CommunityPost post, CommunityComment comment, String anonymousName, String clientIp) {
        if (!access.isAnonymous(post)) {
            comment.setAnonymousName(null);
            comment.setIpAddress(null);
            return;
        }
        comment.setAnonymousName(anonymousIdentity.normalizeAnonymousName(anonymousName));
        comment.setIpAddress(clientIp == null || clientIp.isBlank() ? null : clientIp.trim());
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
        if (textService.safeTitle(post.getTitle()) != null) {
            lines.add(textService.safeTitle(post.getTitle()));
        }
        lines.add("author=" + textService.auditIdentity(comment.getAuthorName(), comment.getStudentId()));
        lines.add("deletedBy=" + textService.auditIdentity(deletedBy.getName(), deletedBy.getStudentId()));
        lines.add("deletedByRole=" + deletedBy.getRole().name());
        if (comment.getContent() != null && !comment.getContent().isBlank()) {
            lines.add("content=" + textService.preview(comment.getContent().trim().replaceAll("\\s+", " ")));
        }
        return String.join("\n", lines);
    }

    private CommunityPost requirePost(Long postId) {
        return communityPostRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
