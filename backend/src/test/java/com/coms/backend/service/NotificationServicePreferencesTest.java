package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notice;
import com.coms.backend.domain.Notification;
import com.coms.backend.dto.NotificationPreferencesRequest;
import com.coms.backend.dto.NotificationPreferencesResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationPreferenceRepository;
import com.coms.backend.repository.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:notification-preferences-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=false",
        "integration.hmac-secret=unit-test-secret-1234567890-abcdef",
        "notification.external-invite.allowed-hosts=example.test"
})
class NotificationServicePreferencesTest {

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private NotificationPreferenceRepository notificationPreferenceRepository;

    @Autowired
    private MemberRepository memberRepository;

    private Member author;
    private Member commenter;

    @BeforeEach
    void setUp() {
        notificationRepository.deleteAll();
        notificationPreferenceRepository.deleteAll();
        author = saveMember("2026910001", "글쓴이");
        commenter = saveMember("2026910002", "댓글러");
    }

    @Test
    void preferencesDefaultToAllEnabledWhenNeverSaved() {
        NotificationPreferencesResponse prefs = notificationService.getPreferences(author.getStudentId());

        assertThat(prefs.commentOnPost()).isTrue();
        assertThat(prefs.replyOnComment()).isTrue();
        assertThat(prefs.noticeCreated()).isTrue();
        assertThat(prefs.externalInvite()).isTrue();
        assertThat(prefs.communityPostRestored()).isTrue();
        assertThat(prefs.communityPostDeleted()).isTrue();
        assertThat(prefs.recruitApplication()).isTrue();
        assertThat(notificationPreferenceRepository.findByMemberStudentId(author.getStudentId())).isEmpty();
    }

    @Test
    void updatePreferencesPersistsAndReturnsNewValues() {
        NotificationPreferencesResponse updated = notificationService.updatePreferences(
                author.getStudentId(),
                new NotificationPreferencesRequest(false, true, false, true, true, true, true));

        assertThat(updated.commentOnPost()).isFalse();
        assertThat(updated.noticeCreated()).isFalse();
        assertThat(updated.replyOnComment()).isTrue();

        NotificationPreferencesResponse reloaded = notificationService.getPreferences(author.getStudentId());
        assertThat(reloaded.commentOnPost()).isFalse();
        assertThat(reloaded.noticeCreated()).isFalse();
        assertThat(reloaded.replyOnComment()).isTrue();
    }

    @Test
    void disabledCategorySuppressesNotificationCreation() {
        // Author opts out of comment-on-post notifications only.
        notificationService.updatePreferences(
                author.getStudentId(),
                new NotificationPreferencesRequest(false, true, true, true, true, true, true));

        CommunityPost post = new CommunityPost();
        post.setAuthorStudentId(author.getStudentId());

        CommunityComment comment = new CommunityComment(
                null, commenter.getStudentId(), commenter.getName(), "댓글 내용", null, 0);

        notificationService.notifyPostComment(post, comment);

        List<Notification> authorNotifs =
                notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(author.getStudentId());
        assertThat(authorNotifs).isEmpty();
    }

    @Test
    void enabledCategoryStillCreatesNotification() {
        Notice notice = new Notice();
        notice.setTitle("새 공지사항");

        notificationService.notifyNoticeCreated(notice);

        List<Notification> authorNotifs =
                notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(author.getStudentId());
        assertThat(authorNotifs).hasSize(1);
        assertThat(authorNotifs.get(0).getType()).isEqualTo(Notification.Type.NOTICE_CREATED);

        // Now disable NOTICE_CREATED for the author and confirm suppression on the bulk path.
        notificationRepository.deleteAll();
        notificationService.updatePreferences(
                author.getStudentId(),
                new NotificationPreferencesRequest(true, true, false, true, true, true, true));

        notificationService.notifyNoticeCreated(notice);

        List<Notification> afterOptOut =
                notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(author.getStudentId());
        assertThat(afterOptOut).isEmpty();
        // Commenter never opted out, so they still receive the notice.
        List<Notification> commenterNotifs =
                notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(commenter.getStudentId());
        assertThat(commenterNotifs).hasSize(1);
    }

    private Member saveMember(String studentId, String name) {
        return memberRepository.findByStudentId(studentId).orElseGet(() -> {
            Member fresh = new Member();
            fresh.setStudentId(studentId);
            fresh.setName(name);
            fresh.setEmail("prefs-" + System.nanoTime() + "@example.com");
            fresh.setPassword("hashed-password");
            fresh.setRole(Member.Role.USER);
            return memberRepository.save(fresh);
        });
    }
}
