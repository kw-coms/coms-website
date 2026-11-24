package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CommunityCommentClockTest {
    @Test
    void rateCutoffAndCreatedCommentUseSameSeoulWallTime() {
        Clock clock = Clock.fixed(Instant.parse("2026-11-30T15:30:00Z"), ZoneId.of("Asia/Seoul"));
        var comments = mock(CommunityCommentRepository.class);
        var posts = mock(CommunityPostRepository.class);
        var access = mock(CommunityAccess.class);
        var text = mock(CommunityTextService.class);
        var reputation = mock(CommunityReputationService.class);
        var members = mock(MemberRepository.class);
        var member = new Member();
        member.setStudentId("2026123456");
        member.setName("회원");
        var post = new CommunityPost();
        when(posts.findById(1L)).thenReturn(Optional.of(post));
        when(access.requireAuthenticatedMember("2026123456")).thenReturn(member);
        when(text.normalizeBounded("댓글", "댓글", 1000)).thenReturn("댓글");
        when(comments.save(any(CommunityComment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(reputation.reputationTiers(any())).thenReturn(Map.of());
        when(members.findByStudentId("2026123456")).thenReturn(Optional.of(member));
        var service = new CommunityCommentService(comments, posts, mock(NotificationService.class),
                mock(AuditLogService.class), access, mock(AnonymousIdentityService.class),
                reputation, text, members, clock);

        service.addComment(1L, "2026123456", new CommunityCommentRequest("댓글", null));

        verify(comments).countByStudentIdAndCreatedAtAfter(eq("2026123456"),
                eq(LocalDateTime.of(2026, 12, 1, 0, 29)));
        var saved = org.mockito.ArgumentCaptor.forClass(CommunityComment.class);
        verify(comments).save(saved.capture());
        assertThat(saved.getValue().getCreatedAt()).isEqualTo(LocalDateTime.of(2026, 12, 1, 0, 30));
        assertThat(saved.getValue().getUpdatedAt()).isEqualTo(saved.getValue().getCreatedAt());
    }
}
