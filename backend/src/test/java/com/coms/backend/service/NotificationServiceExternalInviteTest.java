package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notification;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:notification-external-invite-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=false",
        "integration.hmac-secret=unit-test-secret-1234567890-abcdef"
})
class NotificationServiceExternalInviteTest {

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private EligibleMemberRepository eligibleMemberRepository;

    @BeforeEach
    void setUp() {
        notificationRepository.deleteAll();
    }

    @Test
    void createsExternalInviteForRegisteredMember() {
        Member member = memberRepository.findByStudentId("2026000001").orElseGet(() -> {
            Member fresh = new Member();
            fresh.setStudentId("2026000001");
            fresh.setName("Test Member");
            fresh.setEmail("test-member-" + System.nanoTime() + "@example.com");
            fresh.setPassword("hashed-password");
            return memberRepository.save(fresh);
        });

        Notification saved = notificationService.notifyExternalInvite(
                member.getStudentId(),
                "Food Club",
                "Test invite message",
                "https://foodclub.example.com/accept",
                false
        );

        assertThat(saved.getType()).isEqualTo(Notification.Type.EXTERNAL_INVITE);
        assertThat(saved.getActorLabel()).isEqualTo("Food Club");
        assertThat(saved.getAcceptUrl()).isEqualTo("https://foodclub.example.com/accept");
        assertThat(saved.getRecipientStudentId()).isEqualTo(member.getStudentId());
    }

    @Test
    void createsExternalInviteForEligibleMemberWithoutAccount() {
        String studentId = "2026999999";
        eligibleMemberRepository.findByStudentId(studentId).orElseGet(() -> {
            EligibleMember fresh = new EligibleMember();
            fresh.setStudentId(studentId);
            fresh.setName("Eligible Only");
            return eligibleMemberRepository.save(fresh);
        });

        Notification saved = notificationService.notifyExternalInvite(
                studentId,
                "Food Club",
                "Eligible-only invite",
                null,
                false
        );

        assertThat(saved.getType()).isEqualTo(Notification.Type.EXTERNAL_INVITE);
        assertThat(saved.getAcceptUrl()).isNull();
    }

    @Test
    void rejectsUnknownStudentId() {
        assertThatThrownBy(() -> notificationService.notifyExternalInvite(
                "2026000000",
                "Food Club",
                "should fail",
                null,
                false
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void rejectsBlankRecipient() {
        assertThatThrownBy(() -> notificationService.notifyExternalInvite(
                "  ",
                "Food Club",
                "blank",
                null,
                false
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void rejectsJavascriptAcceptUrl() {
        Member member = memberRepository.findByStudentId("2026000001").orElseGet(() -> {
            Member fresh = new Member();
            fresh.setStudentId("2026000001");
            fresh.setName("Test Member");
            fresh.setEmail("test-scheme-" + System.nanoTime() + "@example.com");
            fresh.setPassword("hashed-password");
            return memberRepository.save(fresh);
        });

        assertThatThrownBy(() -> notificationService.notifyExternalInvite(
                member.getStudentId(),
                "Food Club",
                "xss attempt",
                "javascript:alert(1)",
                false
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(ex.getReason()).contains("acceptUrl");
        });
    }

    @Test
    void rejectsRelativeAcceptUrl() {
        Member member = memberRepository.findByStudentId("2026000001").orElseGet(() -> {
            Member fresh = new Member();
            fresh.setStudentId("2026000001");
            fresh.setName("Test Member");
            fresh.setEmail("test-relative-" + System.nanoTime() + "@example.com");
            fresh.setPassword("hashed-password");
            return memberRepository.save(fresh);
        });

        assertThatThrownBy(() -> notificationService.notifyExternalInvite(
                member.getStudentId(),
                "Food Club",
                "no-scheme",
                "/foodclub/accept",
                false
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }
}
