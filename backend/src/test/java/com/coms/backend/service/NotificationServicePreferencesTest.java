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
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.task.TaskExecutor;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

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

    @MockitoSpyBean
    private NotificationPreferenceRepository notificationPreferenceRepository;

    @MockitoSpyBean
    private PushNotificationSender pushNotificationSender;

    @Autowired
    @Qualifier("pushExecutor")
    private TaskExecutor pushExecutor;

    @Autowired
    private MemberRepository memberRepository;

    private Member author;
    private Member commenter;

    @BeforeEach
    void setUp() {
        notificationRepository.deleteAll();
        notificationPreferenceRepository.deleteAll();
        drainPushExecutor();
        clearInvocations(pushNotificationSender);
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

    @Test
    void noticeFanOutBatchesPreferenceLookupsInsteadOfPerMember() {
        saveMember("2026910011", "회원A");
        saveMember("2026910012", "회원B");
        clearInvocations(notificationPreferenceRepository);

        Notice notice = new Notice();
        notice.setTitle("배치 공지");
        notificationService.notifyNoticeCreated(notice);

        verify(notificationPreferenceRepository, never()).findByMemberStudentId(anyString());
        verify(notificationPreferenceRepository, times(1)).findByMemberStudentIdIn(any());
    }

    @Test
    void disabledCategoryAlsoSuppressesPushDispatch() {
        // Regression: the push used to fire outside the preference check, so a
        // member who turned off comment notifications still got the FCM push.
        notificationService.updatePreferences(
                author.getStudentId(),
                new NotificationPreferencesRequest(false, true, true, true, true, true, true));

        CommunityPost post = new CommunityPost();
        post.setAuthorStudentId(author.getStudentId());
        CommunityComment comment = new CommunityComment(
                null, commenter.getStudentId(), commenter.getName(), "댓글 내용", null, 0);

        notificationService.notifyPostComment(post, comment);
        // Verify at the enqueue point (called synchronously) — asserting on the
        // executor-side sendToMember is racy AND spy/async proxy ordering can
        // route the async hop past the spy entirely on some contexts.
        verify(pushNotificationSender, never()).sendToMemberAsync(anyString(), eq("새 댓글"), anyString(), any());

        // Re-enabled → the push goes out again.
        notificationService.updatePreferences(
                author.getStudentId(),
                new NotificationPreferencesRequest(true, true, true, true, true, true, true));
        notificationService.notifyPostComment(post, comment);
        verify(pushNotificationSender, times(1)).sendToMemberAsync(anyString(), eq("새 댓글"), anyString(), any());
    }

    /**
     * Async push tasks enqueued by a previous test would otherwise execute
     * during THIS test against the freshly-reset spy — drain the queue by
     * waiting on a marker task before every test.
     */
    private void drainPushExecutor() {
        java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
        pushExecutor.execute(latch::countDown);
        try {
            latch.await(5, java.util.concurrent.TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
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
