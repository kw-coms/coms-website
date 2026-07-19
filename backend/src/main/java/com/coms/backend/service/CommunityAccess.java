package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
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

    CommunityAccess(MemberRepository memberRepository) {
        this.memberRepository = memberRepository;
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

    boolean canView(Member member, CommunityPost post) {
        return !isAnonymous(post) || member.getRole() == Member.Role.ADMIN || !isGraduate(member);
    }

    void requireVisible(Member member, CommunityPost post) {
        if (!canView(member, post)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    void requireCategoryAllowed(Member member, CommunityPost.Category category) {
        if (category == CommunityPost.Category.ANONYMOUS && member.getRole() != Member.Role.ADMIN && isGraduate(member)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid community category.");
        }
    }

    void requireOwnerOrAdmin(CommunityPost post, Member member) {
        requireVisible(member, post);
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
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

    boolean canSeeAnonymous(Member member) {
        return member.getRole() == Member.Role.ADMIN || !isGraduate(member);
    }
}
