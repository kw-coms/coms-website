package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.domain.ClubProjectComment;
import com.coms.backend.domain.ClubProjectLike;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.ClubProjectCommentRequest;
import com.coms.backend.dto.ClubProjectCommentResponse;
import com.coms.backend.dto.ClubProjectCommentUpdateRequest;
import com.coms.backend.dto.ClubProjectEngagementResponse;
import com.coms.backend.repository.ClubProjectCommentRepository;
import com.coms.backend.repository.ClubProjectLikeRepository;
import com.coms.backend.repository.ClubProjectRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.SlidingWindowRateLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.util.List;

@Service
@Transactional
public class ClubProjectSocialService {
    private static final int MAX_REPLY_DEPTH = 30;
    private final SlidingWindowRateLimiter commentWrites =
            new SlidingWindowRateLimiter(12, Duration.ofMinutes(1), Clock.systemUTC());

    private final ClubProjectRepository projects;
    private final ClubProjectLikeRepository likes;
    private final ClubProjectCommentRepository comments;
    private final MemberRepository members;
    private final CommunityTextService textService;

    public ClubProjectSocialService(ClubProjectRepository projects, ClubProjectLikeRepository likes,
                                    ClubProjectCommentRepository comments, MemberRepository members,
                                    CommunityTextService textService) {
        this.projects = projects;
        this.likes = likes;
        this.comments = comments;
        this.members = members;
        this.textService = textService;
    }

    public ClubProjectEngagementResponse setLike(Long projectId, String studentId, boolean liked) {
        // Serializing on the work row makes concurrent repeat requests idempotent on H2 and PG.
        ClubProject project = projects.findWithLockById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Member member = requireMember(studentId);
        var existing = likes.findByClubProjectIdAndStudentId(projectId, member.getStudentId());
        if (liked && existing.isEmpty()) likes.save(new ClubProjectLike(projectId, studentId));
        if (!liked) existing.ifPresent(likes::delete);
        return new ClubProjectEngagementResponse(project.getViewCount(), likes.countByClubProjectId(projectId),
                comments.countByClubProjectId(projectId), liked);
    }

    @Transactional(readOnly = true)
    public List<ClubProjectCommentResponse> listComments(Long projectId, String studentId, boolean manager) {
        requireProject(projectId);
        return comments.findByClubProjectIdOrderByCreatedAtAscIdAsc(projectId).stream()
                .map(comment -> response(comment, studentId, manager)).toList();
    }

    public ClubProjectCommentResponse addComment(Long projectId, String studentId, ClubProjectCommentRequest request) {
        requireProject(projectId);
        Member member = requireMember(studentId);
        String content = safeContent(request.content());
        int depth = 0;
        if (request.parentCommentId() != null) {
            ClubProjectComment parent = comments.findById(request.parentCommentId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            if (!parent.getClubProjectId().equals(projectId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "답글 대상이 이 작품에 속하지 않습니다.");
            }
            depth = parent.getDepth() + 1;
            if (depth > MAX_REPLY_DEPTH) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "답글을 더 이어서 달 수 없습니다. 새 댓글로 작성해주세요.");
            }
        }
        limitCommentWrites(studentId);
        ClubProjectComment saved = comments.save(new ClubProjectComment(projectId, member.getStudentId(), member.getName(),
                content, request.parentCommentId(), depth));
        return response(saved, studentId, false);
    }

    public ClubProjectCommentResponse updateComment(Long projectId, Long commentId, String studentId,
                                                     ClubProjectCommentUpdateRequest request) {
        ClubProjectComment comment = requireComment(projectId, commentId);
        requireMember(studentId);
        if (!comment.getStudentId().equals(studentId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        String content = safeContent(request.content());
        limitCommentWrites(studentId);
        comment.updateContent(content);
        return response(comments.save(comment), studentId, false);
    }

    public void deleteComment(Long projectId, Long commentId, String studentId, boolean manager) {
        ClubProjectComment comment = requireComment(projectId, commentId);
        requireMember(studentId);
        if (!manager && !comment.getStudentId().equals(studentId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        limitCommentWrites(studentId);
        // V111's parent FK cascades through replies; a bulk delete avoids stale JPA children.
        comments.deleteTree(commentId);
    }

    public void deleteDataForMember(String studentId) {
        comments.deleteByStudentId(studentId);
        likes.deleteByStudentId(studentId);
        projects.detachOwnedWorks(studentId);
        commentWrites.reset(studentId);
    }

    private ClubProject requireProject(Long id) {
        return projects.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private ClubProjectComment requireComment(Long projectId, Long commentId) {
        requireProject(projectId);
        ClubProjectComment comment = comments.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!comment.getClubProjectId().equals(projectId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return comment;
    }

    private Member requireMember(String studentId) {
        return members.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
    }

    private String safeContent(String content) {
        String cleaned = textService.normalizeBounded(content, "댓글", 1000);
        textService.rejectUnsafeText(cleaned);
        return cleaned;
    }

    private void limitCommentWrites(String studentId) {
        if (!commentWrites.tryAcquire(studentId)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "댓글은 1분에 최대 12번 작성·수정·삭제할 수 있습니다.");
        }
    }

    private ClubProjectCommentResponse response(ClubProjectComment comment, String viewer, boolean manager) {
        boolean own = viewer != null && viewer.equals(comment.getStudentId());
        return new ClubProjectCommentResponse(comment.getId(), comment.getParentCommentId(), comment.getAuthorName(),
                comment.getContent(), comment.getCreatedAt(), comment.getUpdatedAt(), own, own || manager);
    }
}
