package com.coms.backend.service;

import com.coms.backend.domain.LoginFailure;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.repository.LoginFailureRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceLoginThrottleTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final LoginFailureRepository loginFailureRepository = mock(LoginFailureRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final BannedStudentService bannedStudentService = mock(BannedStudentService.class);
    private final AuditLogService auditLogService = mock(AuditLogService.class);
    private final AuthService authService = new AuthService(
            memberRepository,
            loginFailureRepository,
            mock(EligibleMemberService.class),
            passwordEncoder,
            mock(JwtTokenProvider.class),
            mock(EmailVerificationSender.class),
            mock(FontService.class),
            bannedStudentService,
            auditLogService,
            Clock.systemUTC()
    );

    @Test
    void targetedLockoutUsesNormalizedEmailIdentifierBeforePasswordCheck() {
        when(loginFailureRepository.countByStudentIdAndAttemptedAtAfter(eq("member@example.com"), any(LocalDateTime.class)))
                .thenReturn(5L);

        assertThatThrownBy(() -> authService.login(new LoginRequest("  MEMBER@Example.com  ", "Password1!", false), "203.0.113.10"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

        verify(memberRepository, never()).findByEmailIgnoreCase(any());
        verify(passwordEncoder, never()).matches(any(), any());
    }

    @Test
    void passwordSprayingLockoutUsesClientIpBeforeAccountLookup() {
        when(loginFailureRepository.countByIpAndAttemptedAtAfter(eq("198.51.100.20"), any(LocalDateTime.class)))
                .thenReturn(5L);

        assertThatThrownBy(() -> authService.login(new LoginRequest("2026123477", "Password1!", false), "198.51.100.20"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

        verify(memberRepository, never()).findByStudentId(any());
        verify(passwordEncoder, never()).matches(any(), any());
    }

    @Test
    void failedEmailLoginRecordsNormalizedIdentifierForFutureLockouts() {
        Member member = member("2026123476", "member@example.com");
        when(memberRepository.findByStudentId("member@example.com")).thenReturn(Optional.empty());
        when(memberRepository.findByEmailIgnoreCase("member@example.com")).thenReturn(Optional.of(member));
        when(passwordEncoder.matches("wrong", "encoded")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(new LoginRequest("  MEMBER@Example.com  ", "wrong", false), "203.0.113.11"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));

        ArgumentCaptor<LoginFailure> failure = ArgumentCaptor.forClass(LoginFailure.class);
        verify(loginFailureRepository).save(failure.capture());
        assertThat(failure.getValue().getStudentId()).isEqualTo("member@example.com");
        assertThat(failure.getValue().getIp()).isEqualTo("203.0.113.11");
    }

    private static Member member(String studentId, String email) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setEmail(email);
        member.setName("회원");
        member.setPassword("encoded");
        member.setEmailVerified(true);
        return member;
    }
}
