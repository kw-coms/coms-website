package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.PendingSignup;
import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.PendingSignupRepository;
import com.coms.backend.repository.BannedStudentRepository;
import jakarta.persistence.EntityManager;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PendingSignupService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int EMAIL_VERIFICATION_EXPIRES_MINUTES = 10;
    private static final int EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES = 1;
    private static final int MAX_EMAIL_VERIFICATION_ATTEMPTS = 5;
    private static final int MAX_SIGNUPS_PER_WINDOW = 30;
    private static final java.time.Duration SIGNUP_WINDOW = java.time.Duration.ofHours(1);
    private static final int MAX_SIGNUP_EMAIL_REQUESTS_PER_WINDOW = 20;
    private static final java.time.Duration SIGNUP_EMAIL_REQUEST_WINDOW = java.time.Duration.ofMinutes(10);

    private final PendingSignupRepository pendingSignupRepository;
    private final MemberRepository memberRepository;
    private final EligibleMemberService eligibleMemberService;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationSender emailVerificationSender;
    private final BannedStudentService bannedStudentService;
    private final BannedStudentRepository bannedStudentRepository;
    private final AuditLogService auditLogService;
    private final PendingSignupCleanup cleanup;
    private final TransactionTemplate transactionTemplate;
    private final EntityManager entityManager;
    private final Clock clock;

    private final Map<String, java.util.Deque<LocalDateTime>> signupAttemptsByClient = new ConcurrentHashMap<>();
    private final Map<String, java.util.Deque<LocalDateTime>> signupEmailAttemptsByClient = new ConcurrentHashMap<>();

    public PendingSignupService(PendingSignupRepository pendingSignupRepository,
                                MemberRepository memberRepository,
                                EligibleMemberService eligibleMemberService,
                                PasswordEncoder passwordEncoder,
                                EmailVerificationSender emailVerificationSender,
                                BannedStudentService bannedStudentService,
                                BannedStudentRepository bannedStudentRepository,
                                AuditLogService auditLogService,
                                PendingSignupCleanup cleanup,
                                org.springframework.transaction.PlatformTransactionManager transactionManager,
                                EntityManager entityManager,
                                Clock clock) {
        this.pendingSignupRepository = pendingSignupRepository;
        this.memberRepository = memberRepository;
        this.eligibleMemberService = eligibleMemberService;
        this.passwordEncoder = passwordEncoder;
        this.emailVerificationSender = emailVerificationSender;
        this.bannedStudentService = bannedStudentService;
        this.bannedStudentRepository = bannedStudentRepository;
        this.auditLogService = auditLogService;
        this.cleanup = cleanup;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.entityManager = entityManager;
        this.clock = clock;
    }

    public AuthResponse start(SignupRequest request, String clientIp) {
        enforceIpRateLimit(signupAttemptsByClient, "signup", clientIp, MAX_SIGNUPS_PER_WINDOW, SIGNUP_WINDOW);

        PendingSend pendingSend = transactionTemplate.execute(status -> {
            String signupType = resolveSignupType(request);
            validateSignupType(request, signupType);
            EligibleMemberService.PreparedSignup prepared = eligibleMemberService.prepareSignup(request);
            validateCurrentProfile(request, signupType);
            bannedStudentService.ensureNotBanned(prepared.studentId());
            requireMemberStudentIdAvailable(prepared.studentId());
            String normalizedEmail = normalizeRequired(request.email());
            requireEmailAvailableForStart(normalizedEmail, prepared.studentId());

            PendingSignup pending = pendingSignupRepository.findByStudentIdForUpdate(prepared.studentId())
                    .orElseGet(PendingSignup::new);
            String code = newSixDigitCode();
            applyPending(pending, request, prepared, normalizedEmail, code, signupType);
            PendingSignup saved = pendingSignupRepository.saveAndFlush(pending);
            return new PendingSend(saved.getId(), saved.getVerificationCodeHash(), saved.getEmail(), code,
                    saved.getStudentId(), saved.getName());
        });

        if (pendingSend == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "회원가입 신청을 처리할 수 없습니다.");
        }

        try {
            emailVerificationSender.sendVerificationCode(pendingSend.email(), pendingSend.code());
        } catch (RuntimeException ex) {
            cleanup.deleteIfVersionMatches(pendingSend.id(), pendingSend.verificationCodeHash());
            throw ex;
        }
        return new AuthResponse(null, pendingSend.studentId(), pendingSend.name(), "회원가입 신청이 완료되었습니다.");
    }

    public boolean resend(String studentId, String clientIp) {
        enforceIpRateLimit(signupEmailAttemptsByClient, "signup-email", clientIp,
                MAX_SIGNUP_EMAIL_REQUESTS_PER_WINDOW, SIGNUP_EMAIL_REQUEST_WINDOW);

        PendingSend pendingSend = transactionTemplate.execute(status -> {
            PendingSignup pending = pendingSignupRepository.findByStudentIdForUpdate(normalizeRequired(studentId))
                    .orElse(null);
            if (pending == null) {
                return null;
            }
            if (pending.getExpiresAt().isBefore(now())) {
                pendingSignupRepository.delete(pending);
                return null;
            }
            try {
                enforceResendCooldown(pending);
            } catch (ResponseStatusException ignored) {
                return null;
            }
            ensureNotBannedWithoutMarkingConfirmRollbackOnly(pending.getStudentId());
            String code = newSixDigitCode();
            pending.setVerificationCodeHash(passwordEncoder.encode(code));
            pending.setCodeExpiresAt(now().plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES));
            pending.setVerificationAttempts(0);
            PendingSignup saved = pendingSignupRepository.saveAndFlush(pending);
            return new PendingSend(saved.getId(), saved.getVerificationCodeHash(), saved.getEmail(), code,
                    saved.getStudentId(), saved.getName());
        });
        if (pendingSend == null) {
            return false;
        }
        try {
            emailVerificationSender.sendVerificationCode(pendingSend.email(), pendingSend.code());
        } catch (RuntimeException ex) {
            cleanup.clearCodeIfVersionMatches(pendingSend.id(), pendingSend.verificationCodeHash());
            throw ex;
        }
        return false;
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public boolean confirm(String studentId, String code) {
        PendingSignup pending = pendingSignupRepository.findByStudentIdForUpdate(normalizeRequired(studentId))
                .orElseThrow(() -> invalidCode());
        if (pending.getExpiresAt().isBefore(now()) || pending.getCodeExpiresAt().isBefore(now())) {
            pendingSignupRepository.delete(pending);
            throw invalidCode();
        }
        if (!passwordEncoder.matches(code, pending.getVerificationCodeHash())) {
            pending.setVerificationAttempts(pending.getVerificationAttempts() + 1);
            if (pending.getVerificationAttempts() >= MAX_EMAIL_VERIFICATION_ATTEMPTS) {
                pendingSignupRepository.delete(pending);
            } else {
                pendingSignupRepository.save(pending);
            }
            throw invalidCode();
        }

        ensureNotBannedWithoutMarkingConfirmRollbackOnly(pending.getStudentId());
        requireMemberStudentIdAvailable(pending.getStudentId());
        requireMemberEmailAvailable(pending.getEmail());

        EligibleMember eligibleMember = eligibleMemberService.claimPreparedSignup(
                pending.getEligibleMember().getId(), pending.getStudentId());

        Member member = new Member();
        member.setStudentId(pending.getStudentId());
        member.setName(pending.getName());
        member.setEmail(pending.getEmail());
        member.setPassword(pending.getPasswordHash());
        member.setEmailVerified(true);
        member.setRole(pending.getInitialRole());
        member.setDepartment(pending.getDepartment());
        member.setGeneration(pending.getGeneration() == null ? eligibleMember.getGeneration() : pending.getGeneration());
        member.setPhone(pending.getPhone());
        member.setAspiration("CURRENT".equals(pending.getSignupType()) ? pending.getAspiration() : null);
        member.setInterests("CURRENT".equals(pending.getSignupType()) ? pending.getInterests() : null);
        memberRepository.saveAndFlush(member);
        pendingSignupRepository.delete(pending);
        auditLogService.record(pending.getStudentId(), "SIGNUP_EMAIL_VERIFIED_MEMBER_CREATE",
                "MEMBER", pending.getStudentId(), null, null);
        return true;
    }

    @Transactional
    public int deleteExpired(Instant cutoff) {
        LocalDateTime localCutoff = LocalDateTime.ofInstant(cutoff, clock.getZone());
        return entityManager.createQuery("delete from PendingSignup pending where pending.expiresAt < :cutoff")
                .setParameter("cutoff", localCutoff)
                .executeUpdate();
    }

    private void applyPending(PendingSignup pending, SignupRequest request,
                              EligibleMemberService.PreparedSignup prepared, String normalizedEmail,
                              String code, String signupType) {
        pending.setEligibleMember(entityManager.getReference(EligibleMember.class, prepared.eligibleMemberId()));
        pending.setStudentId(prepared.studentId());
        pending.setName(normalizeRequired(request.name()));
        pending.setEmail(normalizedEmail);
        pending.setPasswordHash(passwordEncoder.encode(request.password()));
        pending.setVerificationCodeHash(passwordEncoder.encode(code));
        pending.setCodeExpiresAt(now().plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES));
        pending.setVerificationAttempts(0);
        pending.setDepartment(normalizeNullable(request.department()));
        pending.setGeneration(normalizeNullable(request.generation()) == null ? prepared.generation() : normalizeNullable(request.generation()));
        pending.setPhone(normalizeNullable(request.phone()));
        pending.setAspiration(signupType.equals("CURRENT") ? normalizeNullable(request.aspiration()) : null);
        pending.setInterests(signupType.equals("CURRENT") ? normalizeNullable(request.interests()) : null);
        pending.setSignupType(signupType);
        pending.setInitialRole(prepared.initialRole());
        LocalDateTime now = now();
        if (pending.getCreatedAt() == null) {
            pending.setCreatedAt(now);
        }
        pending.setExpiresAt(now.plusHours(24));
    }

    private void requireEmailAvailableForStart(String email, String studentId) {
        requireMemberEmailAvailable(email);
        Long otherPending = entityManager.createQuery("""
                        select count(pending) from PendingSignup pending
                        where lower(pending.email) = lower(:email) and pending.studentId <> :studentId
                        """, Long.class)
                .setParameter("email", email)
                .setParameter("studentId", studentId)
                .getSingleResult();
        if (otherPending > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }
    }

    private void validateCurrentProfile(SignupRequest request, String signupType) {
        if (!signupType.equals("CURRENT")) {
            return;
        }
        if (normalizeNullable(request.interests()) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "재학생은 관심 분야를 입력해주세요.");
        }
        if (normalizeNullable(request.aspiration()) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "재학생은 포부를 입력해주세요.");
        }
    }

    private void requireMemberEmailAvailable(String email) {
        if (memberRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }
    }

    private void requireMemberStudentIdAvailable(String studentId) {
        if (memberRepository.existsByStudentId(studentId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 가입된 계정입니다.");
        }
    }

    private void ensureNotBannedWithoutMarkingConfirmRollbackOnly(String studentId) {
        if (bannedStudentRepository.findByStudentId(studentId)
                .filter(entry -> entry.getExpiresAt() == null || entry.getExpiresAt().isAfter(now()))
                .isPresent()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "차단된 계정입니다.");
        }
    }

    private void enforceResendCooldown(PendingSignup pending) {
        LocalDateTime expiresAt = pending.getCodeExpiresAt();
        if (pending.getVerificationCodeHash() == null || expiresAt == null) {
            return;
        }
        LocalDateTime cooldownBoundary = now()
                .plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES - EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES);
        if (expiresAt.isAfter(cooldownBoundary)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "이메일 인증코드는 1분 후 다시 요청할 수 있습니다.");
        }
    }

    private ResponseStatusException invalidCode() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "이메일 인증코드가 올바르지 않습니다.");
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    private String newSixDigitCode() {
        return String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
    }

    private String resolveSignupType(SignupRequest request) {
        String normalized = normalizeNullable(request.signupType());
        if (normalized == null) {
            return hasGraduateVerification(request) ? "GRADUATE" : "CURRENT";
        }
        return switch (normalized.toUpperCase(Locale.ROOT)) {
            case "CURRENT", "STUDENT" -> "CURRENT";
            case "GRADUATE", "ALUMNI" -> "GRADUATE";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "가입 구분이 올바르지 않습니다.");
        };
    }

    private boolean hasGraduateVerification(SignupRequest request) {
        return normalizeNullable(request.graduateVerificationType()) != null
                || normalizeNullable(request.graduateVerificationValue()) != null;
    }

    private void validateSignupType(SignupRequest request, String signupType) {
        String studentId = request.studentId() == null ? "" : request.studentId().trim();
        if (!studentId.matches("\\d{10}")) {
            return;
        }
        boolean graduateStudentId = isGraduateStudentId(studentId);
        if (signupType.equals("GRADUATE") && !graduateStudentId) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "졸업생 가입은 졸업생 학번으로만 신청할 수 있습니다.");
        }
        if (signupType.equals("CURRENT") && graduateStudentId) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "졸업생은 졸업생 회원가입을 선택해주세요.");
        }
    }

    private boolean isGraduateStudentId(String studentId) {
        int admissionYear = Integer.parseInt(studentId.substring(0, 4));
        return admissionYear <= Year.now(clock).getValue() - 7;
    }

    private String normalizeRequired(String value) {
        String normalized = normalizeNullable(value);
        if (normalized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "필수 입력값을 확인해주세요.");
        }
        return normalized;
    }

    private String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void enforceIpRateLimit(Map<String, java.util.Deque<LocalDateTime>> attemptsByClient,
                                    String limiterName,
                                    String clientIp,
                                    int maxPerWindow,
                                    java.time.Duration window) {
        String key = clientIp == null || clientIp.isBlank() ? "unknown" : clientIp;
        LocalDateTime now = now();
        LocalDateTime cutoff = now.minus(window);
        java.util.Deque<LocalDateTime> attempts = attemptsByClient.computeIfAbsent(key, ignored -> new java.util.ArrayDeque<>());
        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) {
                attempts.removeFirst();
            }
            if (attempts.size() >= maxPerWindow) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "잠시 후 다시 시도해주세요.");
            }
            attempts.addLast(now);
        }
        attemptsByClient.entrySet().removeIf(entry -> {
            java.util.Deque<LocalDateTime> q = entry.getValue();
            synchronized (q) {
                return q.isEmpty() || q.peekLast().isBefore(cutoff);
            }
        });
    }

    private record PendingSend(UUID id, String verificationCodeHash, String email, String code, String studentId, String name) {}
}

@Service
class PendingSignupCleanup {
    private final EntityManager entityManager;

    PendingSignupCleanup(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deleteIfVersionMatches(UUID id, String verificationCodeHash) {
        entityManager.createQuery("""
                        delete from PendingSignup pending
                        where pending.id = :id and pending.verificationCodeHash = :verificationCodeHash
                        """)
                .setParameter("id", id)
                .setParameter("verificationCodeHash", verificationCodeHash)
                .executeUpdate();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void clearCodeIfVersionMatches(UUID id, String verificationCodeHash) {
        entityManager.createQuery("""
                        update PendingSignup pending
                        set pending.codeExpiresAt = pending.createdAt,
                            pending.verificationAttempts = 0
                        where pending.id = :id and pending.verificationCodeHash = :verificationCodeHash
                        """)
                .setParameter("id", id)
                .setParameter("verificationCodeHash", verificationCodeHash)
                .executeUpdate();
    }
}
