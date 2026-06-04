package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.UpdateProfileRequest;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
                new UpdateProfileRequest(" 01012345678 ", " 프로젝트를 만들고 싶습니다. ", " 웹, AI ")
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

    private Member saveMember(String studentId, boolean emailVerified) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("홍길동");
        member.setEmail(studentId + "@example.com");
        member.setEmailVerified(emailVerified);
        member.setPassword(passwordEncoder.encode("Password1!"));
        return memberRepository.save(member);
    }
}
