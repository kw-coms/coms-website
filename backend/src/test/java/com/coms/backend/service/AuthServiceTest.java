package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.dto.UpdateProfileRequest;
import com.coms.backend.repository.LoginFailureRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:auth-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=false",
        "mail.log-verification-codes=true"
})
class AuthServiceTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        memberRepository.deleteAll();
    }

    @Test
    void updateProfilePersistsEditableMemberFields() {
        saveMember("2026123456", false);

        var response = authService.updateProfile(
                "2026123456",
                new UpdateProfileRequest(" 01012345678 ", " 프로젝트를 만들고 싶습니다. ", " 웹, AI ", null)
        );

        assertThat(response.phone()).isEqualTo("01012345678");
        assertThat(response.aspiration()).isEqualTo("프로젝트를 만들고 싶습니다.");
        assertThat(response.interests()).isEqualTo("웹, AI");

        Member saved = memberRepository.findByStudentId("2026123456").orElseThrow();
        assertThat(saved.getPhone()).isEqualTo("01012345678");
        assertThat(saved.getAspiration()).isEqualTo("프로젝트를 만들고 싶습니다.");
        assertThat(saved.getInterests()).isEqualTo("웹, AI");
    }

    @Test
    void requestEmailVerificationStoresHashedCodeAndExpiry() {
        saveMember("2026123457", false);

        boolean alreadyVerified = authService.requestEmailVerification("2026123457");

        Member saved = memberRepository.findByStudentId("2026123457").orElseThrow();
        assertThat(alreadyVerified).isFalse();
        assertThat(saved.getEmailVerificationCodeHash()).isNotBlank();
        assertThat(saved.getEmailVerificationExpiresAt()).isAfter(LocalDateTime.now());
        assertThat(saved.isEmailVerified()).isFalse();
    }

    @Test
    void requestEmailVerificationRejectsImmediateResend() {
        Member member = saveMember("2026123463", false);
        member.setEmailVerificationCodeHash(passwordEncoder.encode("123456"));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(10));
        memberRepository.save(member);

        assertThatThrownBy(() -> authService.requestEmailVerification("2026123463"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(ex.getReason()).contains("1분 후");
                });
    }

    @Test
    void requestEmailVerificationAllowsResendAfterCooldown() {
        Member member = saveMember("2026123464", false);
        member.setEmailVerificationCodeHash(passwordEncoder.encode("123456"));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(8));
        memberRepository.save(member);

        boolean alreadyVerified = authService.requestEmailVerification("2026123464");

        Member saved = memberRepository.findByStudentId("2026123464").orElseThrow();
        assertThat(alreadyVerified).isFalse();
        assertThat(saved.getEmailVerificationExpiresAt()).isAfter(LocalDateTime.now().plusMinutes(9));
    }

    @Test
    void confirmEmailVerificationRejectsWrongCode() {
        Member member = saveMember("2026123458", false);
        member.setEmailVerificationCodeHash(passwordEncoder.encode("123456"));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(10));
        memberRepository.save(member);

        assertThatThrownBy(() -> authService.confirmEmailVerification("2026123458", "654321"))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(memberRepository.findByStudentId("2026123458").orElseThrow().isEmailVerified()).isFalse();
    }

    @Test
    void confirmEmailVerificationMarksEmailVerifiedAndClearsCode() {
        Member member = saveMember("2026123459", false);
        member.setEmailVerificationCodeHash(passwordEncoder.encode("123456"));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(10));
        memberRepository.save(member);

        boolean verified = authService.confirmEmailVerification("2026123459", "123456");

        Member saved = memberRepository.findByStudentId("2026123459").orElseThrow();
        assertThat(verified).isTrue();
        assertThat(saved.isEmailVerified()).isTrue();
        assertThat(saved.getEmailVerificationCodeHash()).isNull();
        assertThat(saved.getEmailVerificationExpiresAt()).isNull();
    }

    @Test
    void loginRejectsUnverifiedEmailWithUnauthorizedStatus() {
        saveMember("2026123460", false);

        assertThatThrownBy(() -> authService.login(new com.coms.backend.dto.LoginRequest("2026123460", "Password1!"), "127.0.0.1"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(ex.getReason()).contains("이메일 인증");
                });
    }

    @Test
    void loginSucceedsAfterEmailIsVerified() {
        saveMember("2026123461", true);

        var response = authService.login(new com.coms.backend.dto.LoginRequest("2026123461", "Password1!"), "127.0.0.1");

        assertThat(response.token()).isNotBlank();
        assertThat(response.studentId()).isEqualTo("2026123461");
    }

    @Test
    void loginAllowsUnverifiedAdminAccount() {
        saveMember("admin", false, Member.Role.ADMIN);

        var response = authService.login(new com.coms.backend.dto.LoginRequest("admin", "Password1!"), "127.0.0.1");

        assertThat(response.token()).isNotBlank();
        assertThat(response.studentId()).isEqualTo("admin");
    }

    @Test
    @DisplayName("signup fails instead of creating a stuck unverified account when email sending is unavailable")
    void signupPropagatesEmailSendFailure() {
        MemberRepository repo = mock(MemberRepository.class);
        LoginFailureRepository loginFailures = mock(LoginFailureRepository.class);
        EligibleMemberService eligible = mock(EligibleMemberService.class);
        JwtTokenProvider jwt = mock(JwtTokenProvider.class);
        EmailVerificationSender sender = mock(EmailVerificationSender.class);
        FontService fontService = mock(FontService.class);
        when(fontService.isSelectable(null)).thenReturn(true);
        AuthService service = new AuthService(repo, loginFailures, eligible, passwordEncoder, jwt, sender, fontService);

        when(repo.existsByStudentId("2026123462")).thenReturn(false);
        when(repo.existsByEmail("new@example.com")).thenReturn(false);
        doNothing().when(eligible).validateSignup("2026123462", "홍길동");
        when(repo.save(any(Member.class))).thenAnswer(invocation -> invocation.getArgument(0));
        doThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송에 실패했습니다."))
                .when(sender).sendVerificationCode(anyString(), anyString());

        assertThatThrownBy(() -> service.signup(new SignupRequest(
                "2026123462",
                "홍길동",
                "new@example.com",
                "Password1!",
                "컴퓨터공학과",
                "01012345678",
                null,
                null
        )))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    private Member saveMember(String studentId, boolean emailVerified) {
        return saveMember(studentId, emailVerified, Member.Role.USER);
    }

    private Member saveMember(String studentId, boolean emailVerified, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("홍길동");
        member.setEmail(studentId + "@example.com");
        member.setEmailVerified(emailVerified);
        member.setPassword(passwordEncoder.encode("Password1!"));
        member.setRole(role);
        return memberRepository.save(member);
    }
}
