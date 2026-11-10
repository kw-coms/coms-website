package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.AskRequest;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AskServiceTest {
    private final SiteSettingsService settings = mock(SiteSettingsService.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final JavaMailSender sender = mock(JavaMailSender.class);
    private final MutableClock clock = new MutableClock();

    private AskService service(boolean enabled) {
        when(settings.askInboxEmail()).thenReturn("inbox@example.com");
        return new AskService(settings, members, sender, clock, enabled, "sender@example.com");
    }

    private static AskRequest request(String question, String reply, String path) {
        return new AskRequest(question, reply, "Guest", "", path);
    }

    private static AskRequest request() {
        return request("질문을 남깁니다", "guest@example.com", "/study/c");
    }

    private static Authentication memberAuth() {
        return new TestingAuthenticationToken("2026000001", "unused", "ROLE_USER");
    }

    private void member() {
        Member member = mock(Member.class);
        when(member.getId()).thenReturn(1L);
        when(member.getName()).thenReturn("Test Member");
        when(member.getStudentId()).thenReturn("2026000001");
        when(member.getEmail()).thenReturn("member@example.com");
        when(members.findByStudentId("2026000001")).thenReturn(Optional.of(member));
    }

    @Test
    void guestMailUsesReplyToAndPlainTextContext() {
        service(true).send(request("문의합니다\r\nBcc: hidden@example.com", "guest@example.com", "/study/c"), null, "127.0.0.1");

        ArgumentCaptor<SimpleMailMessage> captured = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(captured.capture());
        SimpleMailMessage mail = captured.getValue();
        assertThat(mail.getFrom()).isEqualTo("sender@example.com");
        assertThat(mail.getTo()).containsExactly("inbox@example.com");
        assertThat(mail.getReplyTo()).isEqualTo("guest@example.com");
        assertThat(mail.getSubject()).isEqualTo("[COM's 질문] 문의합니다Bcc: hidden@example.com");
        assertThat(mail.getText()).contains("[질문]\n문의합니다\r\nBcc: hidden@example.com")
                .contains("답장 주소: guest@example.com", "로그인 회원: 아니요", "이름: Guest",
                        "질문 페이지: /study/c", "접수 시각: 2026-11-10 09:00 (KST)")
                .doesNotContain("<html>");
    }

    @Test
    void memberDefaultsToAccountMailAndUsesOnlyAccountIdentity() {
        member();
        AskService service = service(true);
        service.send(new AskRequest("계정 질문입니다", "", "Forged Name", "", "/account"), memberAuth(), "127.0.0.1");
        service.send(new AskRequest("두 번째 질문입니다", "override@example.com", "Forged Name", "", "/account"), memberAuth(), "127.0.0.2");

        ArgumentCaptor<SimpleMailMessage> captured = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender, times(2)).send(captured.capture());
        assertThat(captured.getAllValues().get(0).getReplyTo()).isEqualTo("member@example.com");
        assertThat(captured.getAllValues().get(1).getReplyTo()).isEqualTo("override@example.com");
        assertThat(captured.getAllValues()).allSatisfy(mail -> assertThat(mail.getText())
                .contains("로그인 회원: 예", "이름: Test Member", "학번: 2026000001")
                .doesNotContain("Forged Name"));
    }

    @Test
    void rejectsValidationHoneypotAndHeaderInjectionWithoutSending() {
        AskService service = service(true);
        AskRequest[] bad = {
                request("abcd", "guest@example.com", "/"),
                request("x".repeat(2001), "guest@example.com", "/"),
                request("질문입니다", "", "/"),
                request("질문입니다", "not-an-email", "/"),
                request("질문입니다", "group:test@example.com,other@example.com;", "/"),
                request("질문입니다", "group:;", "/"),
                request("질문입니다", "guest@example.com\r\nBcc: hidden@example.com", "/"),
                new AskRequest("질문입니다", "guest@example.com", "name\nspoof", "", "/"),
                request("질문입니다", "guest@example.com", "https://example.com/other"),
                request("질문입니다", "guest@example.com", "//example.com/other"),
                request("질문입니다", "guest@example.com", "/%2f%2fexample.com"),
                request("질문입니다", "guest@example.com", "/%252f%252fexample.com"),
                request("질문입니다", "guest@example.com", "/%0dspoof"),
                request("질문입니다", "guest@example.com", "/" + "a".repeat(200))
        };
        for (AskRequest badRequest : bad) {
            assertStatus(HttpStatus.BAD_REQUEST, () -> service.send(badRequest, null, "127.0.0.1"));
        }
        verify(sender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void honeypotLooksSuccessfulWithoutMailOrConsumingLimits() {
        AskService service = service(true);
        for (int i = 0; i < 8; i++) {
            service.send(new AskRequest(null, null, null, "robot", null), null, "127.0.0.1");
        }
        service.send(request(), null, "127.0.0.1");
        verify(sender, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void disabledAddressOrMailReturns503() {
        AskService service = service(true);
        when(settings.askInboxEmail()).thenReturn("");
        assertStatus(HttpStatus.SERVICE_UNAVAILABLE, () -> service.send(request(), null, "127.0.0.1"));
        when(settings.askInboxEmail()).thenReturn("inbox@example.com");
        assertStatus(HttpStatus.SERVICE_UNAVAILABLE, () -> service(false).send(request(), null, "127.0.0.1"));
        AskService invalidInbox = service(true);
        when(settings.askInboxEmail()).thenReturn("inbox@example.com\r\nBcc: hidden@example.com");
        assertStatus(HttpStatus.SERVICE_UNAVAILABLE, () -> invalidInbox.send(request(), null, "127.0.0.1"));
        when(settings.askInboxEmail()).thenReturn("inbox@example.com");
        AskService badFrom = new AskService(settings, members, sender, clock, true,
                "sender@example.com\r\nBcc: hidden@example.com");
        assertStatus(HttpStatus.SERVICE_UNAVAILABLE, () -> badFrom.send(request(), null, "127.0.0.1"));
        verify(sender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void ipAndAccountAreCappedAtThreePerTenMinutes() {
        AskService ipService = service(true);
        for (int i = 0; i < 3; i++) ipService.send(request(), null, "127.0.0.1");
        assertStatus(HttpStatus.TOO_MANY_REQUESTS, () -> ipService.send(request(), null, "127.0.0.1"));

        member();
        AskService memberService = service(true);
        for (int i = 0; i < 3; i++) memberService.send(request(), memberAuth(), "127.0.0." + i);
        assertStatus(HttpStatus.TOO_MANY_REQUESTS,
                () -> memberService.send(request(), memberAuth(), "127.0.0.4"));
        verify(sender, times(6)).send(any(SimpleMailMessage.class));
    }

    @Test
    void dailyIpAndGlobalHourCapsPreventFlooding() {
        AskService dailyService = service(true);
        for (int i = 0; i < 10; i++) {
            dailyService.send(request(), null, "127.0.0.1");
            clock.advanceMinutes(11);
        }
        assertStatus(HttpStatus.TOO_MANY_REQUESTS, () -> dailyService.send(request(), null, "127.0.0.1"));

        AskService globalService = service(true);
        for (int i = 0; i < 30; i++) globalService.send(request(), null, "10.0.0." + i);
        assertStatus(HttpStatus.TOO_MANY_REQUESTS, () -> globalService.send(request(), null, "10.0.0.31"));
        verify(sender, times(40)).send(any(SimpleMailMessage.class));
    }

    @Test
    void accountDailyCapAppliesAcrossChangingIps() {
        member();
        AskService service = service(true);
        for (int i = 0; i < 10; i++) {
            service.send(request(), memberAuth(), "10.0.0." + i);
            clock.advanceMinutes(11);
        }
        assertStatus(HttpStatus.TOO_MANY_REQUESTS,
                () -> service.send(request(), memberAuth(), "10.0.0.11"));
        verify(sender, times(10)).send(any(SimpleMailMessage.class));
    }

    @Test
    void globalDailyCapAppliesAfterHourlyWindowExpires() {
        AskService service = service(true);
        for (int i = 0; i < 60; i++) {
            service.send(request(), null, "10.0.0." + i);
            clock.advanceMinutes(2);
        }
        assertStatus(HttpStatus.TOO_MANY_REQUESTS,
                () -> service.send(request(), null, "10.1.0.1"));
        verify(sender, times(60)).send(any(SimpleMailMessage.class));
    }

    @Test
    void configuredGlobalDailyCapIsApplied() {
        when(settings.askInboxEmail()).thenReturn("inbox@example.com");
        AskService service = new AskService(settings, members, sender, clock, true, "sender@example.com", 1);
        service.send(request(), null, "10.0.0.1");
        clock.advanceMinutes(11);
        assertStatus(HttpStatus.TOO_MANY_REQUESTS,
                () -> service.send(request(), null, "10.0.0.2"));
        verify(sender, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void failedMemberLimitDoesNotSpendIpTokens() {
        member();
        AskService service = service(true);
        for (int i = 0; i < 3; i++) service.send(request(), memberAuth(), "10.0.0." + i);
        assertStatus(HttpStatus.TOO_MANY_REQUESTS,
                () -> service.send(request(), memberAuth(), "10.0.0.3"));
        for (int i = 0; i < 3; i++) service.send(request(), null, "10.0.0.3");
        verify(sender, times(6)).send(any(SimpleMailMessage.class));
    }

    private static void assertStatus(HttpStatus status, Runnable call) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ResponseStatusException.class,
                ex -> assertThat(ex.getStatusCode()).isEqualTo(status));
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-10T00:00:00Z");

        void advanceMinutes(long minutes) { now = now.plusSeconds(minutes * 60); }

        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
