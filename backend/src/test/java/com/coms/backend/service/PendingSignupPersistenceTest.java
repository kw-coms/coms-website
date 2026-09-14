package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.PendingSignup;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.PendingSignupRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:pending-signup-persistence-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@Transactional
class PendingSignupPersistenceTest {

    @Autowired
    private PendingSignupRepository pendingSignupRepository;

    @Autowired
    private EligibleMemberRepository eligibleMemberRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        pendingSignupRepository.deleteAll();
        eligibleMemberRepository.deleteAll();
    }

    @Test
    void pendingSignupStoresOnlyHashesAndExpiresAfter24Hours() {
        String rawPassword = "Password!123";
        String rawCode = "123456";

        PendingSignup saved = pendingSignupRepository.save(samplePending(
                passwordEncoder.encode(rawPassword),
                passwordEncoder.encode(rawCode)
        ));

        assertThat(saved.getPasswordHash()).isNotEqualTo(rawPassword);
        assertThat(saved.getVerificationCodeHash()).isNotEqualTo(rawCode);
        assertThat(passwordEncoder.matches(rawPassword, saved.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches(rawCode, saved.getVerificationCodeHash())).isTrue();
        assertThat(saved.getExpiresAt()).isEqualTo(saved.getCreatedAt().plusHours(24));
    }

    private PendingSignup samplePending(String passwordHash, String verificationCodeHash) {
        EligibleMember eligibleMember = new EligibleMember();
        eligibleMember.setStudentId("2024123456");
        eligibleMember.setName("홍길동");
        eligibleMember.setGeneration("58");
        eligibleMember.setInitialRole(Member.Role.USER);
        EligibleMember savedEligibleMember = eligibleMemberRepository.save(eligibleMember);

        PendingSignup pendingSignup = new PendingSignup();
        pendingSignup.setEligibleMember(savedEligibleMember);
        pendingSignup.setStudentId("2024123456");
        pendingSignup.setName("홍길동");
        pendingSignup.setEmail("hong@example.com");
        pendingSignup.setPasswordHash(passwordHash);
        pendingSignup.setVerificationCodeHash(verificationCodeHash);
        pendingSignup.setCodeExpiresAt(LocalDateTime.parse("2026-06-06T00:10:00"));
        pendingSignup.setDepartment("컴퓨터공학부");
        pendingSignup.setGeneration("58");
        pendingSignup.setPhone("01012345678");
        pendingSignup.setAspiration("열심히 하겠습니다");
        pendingSignup.setInterests("backend");
        pendingSignup.setSignupType("student");
        pendingSignup.setInitialRole(Member.Role.USER);
        return pendingSignup;
    }
}
