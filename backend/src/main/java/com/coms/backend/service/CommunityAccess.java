package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Year;
import java.util.regex.Pattern;

/**
 * Shared access kernel for the community domain: member resolution plus the anonymous-post
 * visibility and ownership rules that posts, comments, media, and polls all enforce identically.
 * Centralising it keeps a single definition of "who may see / mutate this post" instead of each
 * collaborating service re-deriving it.
 */
@Component
class CommunityAccess {
    private static final int GRADUATE_AFTER_YEARS = 7;
    private static final Pattern TEN_DIGIT_STUDENT_ID = Pattern.compile("\\d{10}");

    private final MemberRepository memberRepository;
    private final PermissionService permissionService;

    CommunityAccess(MemberRepository memberRepository, PermissionService permissionService) {
        this.memberRepository = memberRepository;
        this.permissionService = permissionService;
    }

    Member requireMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    Member requireAuthenticatedMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    boolean isAnonymous(CommunityPost post) {
        return post.getCategory() == CommunityPost.Category.ANONYMOUS;
    }

    /**
     * community.moderate 권한 보유자 = community moderator: may view/moderate the
     * anonymous board, edit/delete others' posts and comments, and see
     * unmasked authors. 기본값은 부회장(VICE_PRESIDENT)이지만 회장이 권한
     * 매트릭스에서 조정할 수 있고, 회장(ADMIN)은 언제나 통과한다.
     */
    boolean isModerator(Member member) {
        return permissionService.has(member, Permission.COMMUNITY_MODERATE);
    }

    boolean canView(Member member, CommunityPost post) {
        return !isAnonymous(post) || canSeeAnonymous(member);
    }

    void requireVisible(Member member, CommunityPost post) {
        if (!canView(member, post)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    void requireCategoryAllowed(Member member, CommunityPost.Category category) {
        if (category == CommunityPost.Category.ANONYMOUS && !canSeeAnonymous(member)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid community category.");
        }
    }

    void requireOwnerOrAdmin(CommunityPost post, Member member) {
        requireVisible(member, post);
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && !isModerator(member)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    boolean isGraduate(Member member) {
        String studentId = member.getStudentId();
        if (studentId == null || !TEN_DIGIT_STUDENT_ID.matcher(studentId).matches()) {
            return true;
        }
        int admissionYear = Integer.parseInt(studentId.substring(0, 4));
        return admissionYear <= Year.now().getValue() - GRADUATE_AFTER_YEARS;
    }

    /**
     * 익명게시판 열람/작성: community.anonymous_board 권한 + 졸업생 제외 규칙.
     * 중재 권한 보유자는 졸업 여부와 무관하게 통과한다(신고 처리를 위해).
     */
    boolean canSeeAnonymous(Member member) {
        return isModerator(member)
                || (permissionService.has(member, Permission.COMMUNITY_ANONYMOUS_BOARD) && !isGraduate(member));
    }
}
