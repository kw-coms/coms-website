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
        "integration.hmac-secret=unit-test-secret-1234567890-abcdef"
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
        assertThat(saved.get(0).getAcceptUrl()).contains("invite=abc");
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
