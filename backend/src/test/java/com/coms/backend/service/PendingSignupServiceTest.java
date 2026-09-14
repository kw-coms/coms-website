package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.PendingSignup;
import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.BannedStudentRepository;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.PendingSignupRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:pending-signup-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=false",
        "mail.log-verification-codes=true"
})
class PendingSignupServiceTest {

    @Autowired
    private PendingSignupService service;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private PendingSignupRepository pendingRepository;

    @Autowired
    private EligibleMemberRepository eligibleMemberRepository;

    @Autowired
    private BannedStudentService bannedStudentService;

    @Autowired
    private BannedStudentRepository bannedStudentRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @MockitoBean
    private EmailVerificationSender emailVerificationSender;

    @BeforeEach
    void setUp() {
        reset(emailVerificationSender);
        auditLogRepository.deleteAll();
        pendingRepository.deleteAll();
        memberRepository.deleteAll();
        bannedStudentRepository.deleteAll();
        eligibleMemberRepository.deleteAll();
    }

    @Test
    @DisplayName("signup start creates only pending data and confirm creates exactly one verified member")
    void startDoesNotCreateMemberAndConfirmCreatesExactlyOneVerifiedMember() {
        saveEligible("2026123456", "홍길동", "60", "01012345678", Member.Role.USER);

        AuthResponse started = service.start(currentStudentRequest("2026123456", "new@example.com"), "198.51.100.8");

        assertThat(started.token()).isNull();
        assertThat(started.refreshToken()).isNull();
        assertThat(started.studentId()).isEqualTo("2026123456");
        assertThat(memberRepository.findByStudentId(started.studentId())).isEmpty();
        PendingSignup pending = pendingRepository.findByStudentId(started.studentId()).orElseThrow();
        assertThat(passwordEncoder.matches("Password1!", pending.getPasswordHash())).isTrue();

        assertThat(service.confirm(started.studentId(), sentCode())).isTrue();

        Member member = memberRepository.findByStudentId(started.studentId()).orElseThrow();
        assertThat(member.isEmailVerified()).isTrue();
        assertThat(passwordEncoder.matches("Password1!", member.getPassword())).isTrue();
        assertThat(member.getEmailVerificationCodeHash()).isNull();
        assertThat(pendingRepository.findByStudentId(started.studentId())).isEmpty();
        assertThat(auditLogRepository.findAll())
                .anySatisfy(log -> assertThat(log.getAction()).isEqualTo("SIGNUP_EMAIL_VERIFIED_MEMBER_CREATE"));
    }

    @Test
    @DisplayName("concurrent confirmation creates only one member for one pending signup")
    void concurrentConfirmationCreatesOneMember() throws Exception {
        saveEligible("2026123457", "홍길동", "60", "01012345678", Member.Role.USER);
        service.start(currentStudentRequest("2026123457", "race@example.com"), "198.51.100.9");
        String code = sentCode();

        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> confirm = () -> {
                try {
                    return service.confirm("2026123457", code);
                } catch (ResponseStatusException ex) {
                    return false;
                }
            };
            List<Future<Boolean>> results = executor.invokeAll(List.of(confirm, confirm));

            assertThat(results.stream().filter(this::completedSuccessfully).count()).isEqualTo(1);
        }
        assertThat(memberRepository.findAll().stream()
                .filter(member -> "2026123457".equals(member.getStudentId()))
                .count()).isEqualTo(1);
    }

    @Test
    @DisplayName("wrong signup code is checked with BCrypt and expires after five attempts")
    void wrongCodeFiveTimesClearsPendingVerificationCode() {
        saveEligible("2026123458", "홍길동", "60", "01012345678", Member.Role.USER);
        service.start(currentStudentRequest("2026123458", "wrong-code@example.com"), "198.51.100.10");
        String correctCode = sentCode();

        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> service.confirm("2026123458", "000000"))
                    .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        }
        assertThatThrownBy(() -> service.confirm("2026123458", correctCode))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThat(pendingRepository.findByStudentId("2026123458")).isEmpty();
        assertThat(memberRepository.existsByStudentId("2026123458")).isFalse();
    }

    @Test
    @DisplayName("expired pending code cannot create a member")
    void expiredCodeCannotCreateMember() {
        saveEligible("2026123459", "홍길동", "60", "01012345678", Member.Role.USER);
        service.start(currentStudentRequest("2026123459", "expired@example.com"), "198.51.100.11");
        String code = sentCode();
        PendingSignup pending = pendingRepository.findByStudentId("2026123459").orElseThrow();
        pending.setCodeExpiresAt(LocalDateTime.now().minusSeconds(1));
        pendingRepository.save(pending);

        assertThatThrownBy(() -> service.confirm("2026123459", code))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        assertThat(memberRepository.existsByStudentId("2026123459")).isFalse();
        assertThat(pendingRepository.findByStudentId("2026123459")).isEmpty();
    }

    @Test
    @DisplayName("resend replaces the pending verification code instead of using an unverified member")
    void resendReplacesPendingVerificationCode() {
        saveEligible("2026123460", "홍길동", "60", "01012345678", Member.Role.USER);
        service.start(currentStudentRequest("2026123460", "resend@example.com"), "198.51.100.12");
        String oldCode = sentCode();
        PendingSignup oldPending = pendingRepository.findByStudentId("2026123460").orElseThrow();
        oldPending.setCodeExpiresAt(LocalDateTime.now().plusMinutes(8));
        pendingRepository.save(oldPending);

        assertThat(service.resend("2026123460", "198.51.100.12")).isFalse();
        String newCode = sentCode();

        assertThatThrownBy(() -> service.confirm("2026123460", oldCode))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(service.confirm("2026123460", newCode)).isTrue();
        assertThat(memberRepository.findByStudentId("2026123460")).isPresent();
    }

    @Test
    @DisplayName("resend sends SMTP after commit and failed cleanup cannot remove a newer pending version")
    void resendSendsAfterCommitAndFailureCleanupCannotTouchNewerVersion() {
        saveEligible("2026123472", "홍길동", "60", "01012345678", Member.Role.USER);
        service.start(currentStudentRequest("2026123472", "resend-failure@example.com"), "198.51.100.22");
        PendingSignup pending = pendingRepository.findByStudentId("2026123472").orElseThrow();
        pending.setCodeExpiresAt(LocalDateTime.now().plusMinutes(8));
        pendingRepository.save(pending);
        reset(emailVerificationSender);

        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            transactionTemplate.executeWithoutResult(status -> {
                PendingSignup newer = pendingRepository.findByStudentIdForUpdate("2026123472").orElseThrow();
                newer.setVerificationCodeHash(passwordEncoder.encode("999999"));
                newer.setCodeExpiresAt(LocalDateTime.now().plusMinutes(9));
                pendingRepository.saveAndFlush(newer);
            });
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송에 실패했습니다.");
        }).when(emailVerificationSender).sendVerificationCode(anyString(), anyString());

        assertThatThrownBy(() -> service.resend("2026123472", "198.51.100.22"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));

        PendingSignup preserved = pendingRepository.findByStudentId("2026123472").orElseThrow();
        assertThat(passwordEncoder.matches("999999", preserved.getVerificationCodeHash())).isTrue();
    }

    @Test
    @DisplayName("confirm rechecks bans and duplicate email before member creation")
    void confirmRechecksBansAndDuplicateEmail() {
        saveEligible("2026123461", "홍길동", "60", "01012345678", Member.Role.USER);
        service.start(currentStudentRequest("2026123461", "recheck@example.com"), "198.51.100.13");
        String bannedCode = sentCode();
        bannedStudentService.ban("2026123461", "6H");

        assertThatThrownBy(() -> service.confirm("2026123461", bannedCode))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(memberRepository.existsByStudentId("2026123461")).isFalse();

        bannedStudentRepository.deleteAll();
        saveEligible("2026123462", "홍길동", "60", "01012345678", Member.Role.USER);
        service.start(currentStudentRequest("2026123462", "duplicate-confirm@example.com"), "198.51.100.14");
        String duplicateCode = sentCode();
        saveMember("2026999999", "duplicate-confirm@example.com");

        assertThatThrownBy(() -> service.confirm("2026123462", duplicateCode))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(memberRepository.existsByStudentId("2026123462")).isFalse();
    }

    @Test
    @DisplayName("start rejects emails already used by members or other pending rows")
    void startRejectsDuplicateEmailAcrossMembersAndPendingRows() {
        saveMember("2026000001", "taken@example.com");
        saveEligible("2026123463", "홍길동", "60", "01012345678", Member.Role.USER);
        assertThatThrownBy(() -> service.start(currentStudentRequest("2026123463", "TAKEN@example.com"), "198.51.100.15"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        saveEligible("2026123464", "김철수", "60", "01012345679", Member.Role.USER);
        service.start(currentStudentRequest("2026123464", "pending@example.com", "김철수", "01012345679"), "198.51.100.16");
        saveEligible("2026123465", "이영희", "60", "01012345670", Member.Role.USER);

        assertThatThrownBy(() -> service.start(currentStudentRequest("2026123465", "PENDING@example.com", "이영희", "01012345670"), "198.51.100.17"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    @DisplayName("SMTP failure deletes the exact pending signup created for that send")
    void smtpFailureCleansUpPendingSignup() {
        saveEligible("2026123466", "홍길동", "60", "01012345678", Member.Role.USER);
        doThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송에 실패했습니다."))
                .when(emailVerificationSender).sendVerificationCode(anyString(), anyString());

        assertThatThrownBy(() -> service.start(currentStudentRequest("2026123466", "smtp-failure@example.com"), "198.51.100.18"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));

        assertThat(memberRepository.existsByStudentId("2026123466")).isFalse();
        assertThat(pendingRepository.findByStudentId("2026123466")).isEmpty();
    }

    @Test
    @DisplayName("daily retention deletes expired pending signups")
    void deleteExpiredRemovesRowsPastCutoff() {
        saveEligible("2026123467", "홍길동", "60", "01012345678", Member.Role.USER);
        service.start(currentStudentRequest("2026123467", "old@example.com"), "198.51.100.19");
        saveEligible("2026123468", "김철수", "60", "01012345679", Member.Role.USER);
        service.start(currentStudentRequest("2026123468", "fresh@example.com", "김철수", "01012345679"), "198.51.100.20");
        PendingSignup old = pendingRepository.findByStudentId("2026123467").orElseThrow();
        old.setExpiresAt(LocalDateTime.now().minusDays(1));
        pendingRepository.save(old);

        int deleted = service.deleteExpired(Instant.now());

        assertThat(deleted).isEqualTo(1);
        assertThat(pendingRepository.findByStudentId("2026123467")).isEmpty();
        assertThat(pendingRepository.findByStudentId("2026123468")).isPresent();
    }

    private boolean completedSuccessfully(Future<Boolean> future) {
        try {
            return future.get();
        } catch (Exception ex) {
            return false;
        }
    }

    private String sentCode() {
        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(emailVerificationSender, org.mockito.Mockito.atLeastOnce()).sendVerificationCode(anyString(), captor.capture());
        return captor.getAllValues().getLast();
    }

    private EligibleMember saveEligible(String studentId, String name, String generation, String phone, Member.Role role) {
        EligibleMember eligible = new EligibleMember();
        eligible.setStudentId(studentId);
        eligible.setName(name);
        eligible.setGeneration(generation);
        eligible.setPhone(phone);
        eligible.setInitialRole(role);
        return eligibleMemberRepository.save(eligible);
    }

    private Member saveMember(String studentId, String email) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("기존회원");
        member.setEmail(email);
        member.setPassword(passwordEncoder.encode("Password1!"));
        member.setEmailVerified(true);
        return memberRepository.save(member);
    }

    private SignupRequest currentStudentRequest(String studentId, String email) {
        return currentStudentRequest(studentId, email, "홍길동", "01012345678");
    }

    private SignupRequest currentStudentRequest(String studentId, String email, String name, String phone) {
        return new SignupRequest(
                studentId,
                name,
                null,
                null,
                email,
                "Password1!",
                "컴퓨터공학과",
                "60",
                phone,
                "신입 부원으로 열심히 활동하겠습니다.",
                "보안,웹",
                "CURRENT"
        );
    }
}
