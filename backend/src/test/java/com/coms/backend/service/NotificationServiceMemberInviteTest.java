package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notification;
import com.coms.backend.dto.MemberExternalInviteRequest;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:notification-member-invite-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=false",
        "integration.hmac-secret=unit-test-secret-1234567890-abcdef",
        "notification.external-invite.allowed-hosts=example.test"
})
class NotificationServiceMemberInviteTest {

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private EligibleMemberRepository eligibleMemberRepository;

    private Member sender;
    private Member recipient;
    private EligibleMember eligibleOnly;

    @BeforeEach
    void setUp() {
        notificationRepository.deleteAll();
        sender = memberRepository.findByStudentId("2026100001").orElseGet(() -> {
            Member fresh = new Member();
            fresh.setStudentId("2026100001");
            fresh.setName("Sender Member");
            fresh.setEmail("sender-" + System.nanoTime() + "@example.com");
            fresh.setPassword("hashed-password");
            return memberRepository.save(fresh);
        });
        recipient = memberRepository.findByStudentId("2026100002").orElseGet(() -> {
            Member fresh = new Member();
            fresh.setStudentId("2026100002");
            fresh.setName("Recipient Member");
            fresh.setEmail("recipient-" + System.nanoTime() + "@example.com");
            fresh.setPassword("hashed-password");
            return memberRepository.save(fresh);
        });
        eligibleOnly = eligibleMemberRepository.findByStudentId("2026100003").orElseGet(() -> {
            EligibleMember fresh = new EligibleMember();
            fresh.setStudentId("2026100003");
            fresh.setName("Eligible Only");
            return eligibleMemberRepository.save(fresh);
        });
    }

    private MemberExternalInviteRequest request(List<String> recipients, String actorLabel, String message, String acceptUrl) {
        MemberExternalInviteRequest req = new MemberExternalInviteRequest();
        req.setRecipientStudentIds(recipients);
        req.setActorLabel(actorLabel);
        req.setMessage(message);
        req.setAcceptUrl(acceptUrl);
        return req;
    }

    @Test
    void fanOutsExternalInvitesToKnownStudentIds() {
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId(), eligibleOnly.getStudentId()),
                "팀메이트",
                "팀플 같이해요",
                "https://example.test/team-randomizer/#invite=abc"
        );

        NotificationService.ExternalInviteBatchResult result = notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req);

        assertThat(result.accepted()).isEqualTo(2);
        assertThat(result.unknown()).isEmpty();
        assertThat(result.rejected()).isZero();
        List<Notification> saved = notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(recipient.getStudentId());
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getType()).isEqualTo(Notification.Type.EXTERNAL_INVITE);
        assertThat(saved.get(0).getActorLabel()).isEqualTo("팀메이트");
        assertThat(saved.get(0).getActorStudentId()).isEqualTo(sender.getStudentId());
        assertThat(saved.get(0).getAcceptUrl()).contains("invite=abc");
    }

    @Test
    void acceptsLongTeamMateInviteUrls() {
        String invitePayload = "a".repeat(900);
        String longAcceptUrl = "https://example.test/team-randomizer/#invite=" + invitePayload;
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId()),
                "팀메이트",
                "팀플 같이해요",
                longAcceptUrl
        );

        NotificationService.ExternalInviteBatchResult result = notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req);

        assertThat(result.accepted()).isEqualTo(1);
        Notification saved = notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(recipient.getStudentId()).get(0);
        assertThat(saved.getAcceptUrl()).isEqualTo(longAcceptUrl);
    }

    @Test
    void truncatesActorLabelToOneHundredCharacters() {
        String longLabel = "ㄱ".repeat(150);
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId()),
                longLabel,
                "팀플",
                null
        );

        notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req);

        Notification saved = notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(recipient.getStudentId()).get(0);
        assertThat(saved.getActorLabel()).hasSize(100);
    }

    @Test
    void rejectsAcceptUrlOutsideAllowlist() {
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId()),
                "팀메이트",
                "팀플",
                "https://evil.example/phish"
        );

        assertThatThrownBy(() -> notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(ex.getReason()).contains("host");
                });
        assertThat(notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(recipient.getStudentId())).isEmpty();
    }

    @Test
    void rejectsNonHttpAcceptUrlScheme() {
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId()),
                "팀메이트",
                "팀플",
                "javascript:alert(1)"
        );

        assertThatThrownBy(() -> notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void dedupesRecipientsAfterTrimmingWhitespace() {
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId(), " " + recipient.getStudentId() + " ", recipient.getStudentId() + "\n"),
                "팀메이트",
                "팀플",
                null
        );

        NotificationService.ExternalInviteBatchResult result = notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req);

        assertThat(result.accepted()).isEqualTo(1);
        assertThat(notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(recipient.getStudentId())).hasSize(1);
    }

    @Test
    void enforcesPerMinuteRateLimit() {
        for (int i = 0; i < 10; i++) {
            notificationService.notifyExternalInviteFromMember(sender.getStudentId(),
                    request(List.of(recipient.getStudentId()), "팀메이트", "팀플 " + i, null));
        }

        assertThatThrownBy(() -> notificationService.notifyExternalInviteFromMember(sender.getStudentId(),
                request(List.of(recipient.getStudentId()), "팀메이트", "한 건 더", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    @Test
    void defaultsActorLabelToSenderName() {
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId()),
                "  ",
                "hi",
                null
        );

        NotificationService.ExternalInviteBatchResult result = notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req);

        assertThat(result.accepted()).isEqualTo(1);
        Notification saved = notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(recipient.getStudentId()).get(0);
        assertThat(saved.getActorLabel()).isEqualTo(sender.getName());
    }

    @Test
    void reportsUnknownStudentIdsWithoutFailingBatch() {
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId(), "9999999999"),
                "팀메이트",
                "팀플",
                null
        );

        NotificationService.ExternalInviteBatchResult result = notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req);

        assertThat(result.accepted()).isEqualTo(1);
        assertThat(result.unknown()).containsExactly("9999999999");
        assertThat(result.rejected()).isZero();
    }

    @Test
    void rejectsSelfInviteAndDuplicates() {
        MemberExternalInviteRequest req = request(
                List.of(sender.getStudentId(), recipient.getStudentId(), recipient.getStudentId()),
                "팀메이트",
                "팀플",
                null
        );

        NotificationService.ExternalInviteBatchResult result = notificationService.notifyExternalInviteFromMember(sender.getStudentId(), req);

        assertThat(result.accepted()).isEqualTo(1);
        assertThat(result.rejected()).isEqualTo(1);
    }

    @Test
    void unauthorizedWhenSenderIsNotARegisteredMember() {
        MemberExternalInviteRequest req = request(
                List.of(recipient.getStudentId()),
                "팀메이트",
                "팀플",
                null
        );

        assertThatThrownBy(() -> notificationService.notifyExternalInviteFromMember("2026099999", req))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }
}
