package com.coms.backend.service;

import com.coms.backend.domain.LoginFailure;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.dto.UpdateProfileRequest;
import com.coms.backend.repository.LoginFailureRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;

@Service
@Transactional
public class AuthService implements UserDetailsService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int EMAIL_VERIFICATION_EXPIRES_MINUTES = 10;
    private static final int EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES = 1;
    private static final int PASSWORD_RESET_EXPIRES_MINUTES = 10;
    private static final int PASSWORD_RESET_RESEND_COOLDOWN_MINUTES = 1;
    private static final int MAX_PASSWORD_RESET_ATTEMPTS = 5;
    private static final int MAX_EMAIL_VERIFICATION_ATTEMPTS = 5;
    private static final int MAX_FAILURES_PER_ID = 5;
    private static final int MAX_FAILURES_PER_IP = 5;
    private static final int LOCKOUT_WINDOW_MINUTES = 15;

    private final MemberRepository memberRepository;
    private final LoginFailureRepository loginFailureRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final EmailVerificationSender emailVerificationSender;
    private final FontService fontService;
    private final BannedStudentService bannedStudentService;
    private final AuditLogService auditLogService;
    private final RefreshSessionService refreshSessionService;
    private final PendingSignupService pendingSignupService;
    private final Clock clock;

    public AuthService(MemberRepository memberRepository,
                       LoginFailureRepository loginFailureRepository,
                       EligibleMemberService eligibleMemberService,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider jwtTokenProvider,
                       EmailVerificationSender emailVerificationSender,
                       FontService fontService,
                       BannedStudentService bannedStudentService,
                       AuditLogService auditLogService,
                       RefreshSessionService refreshSessionService,
                       PendingSignupService pendingSignupService,
                       Clock clock) {
        this.memberRepository = memberRepository;
        this.loginFailureRepository = loginFailureRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.emailVerificationSender = emailVerificationSender;
        this.fontService = fontService;
        this.bannedStudentService = bannedStudentService;
        this.auditLogService = auditLogService;
        this.refreshSessionService = refreshSessionService;
        this.pendingSignupService = pendingSignupService;
        this.clock = clock;
    }

    public AuthResponse signup(SignupRequest request, String clientIp) {
        return pendingSignupService.start(request, clientIp);
    }

    public AuthResponse login(LoginRequest request, String clientIp) {
        String normalizedIdentifier = normalizeLoginIdentifier(request.identifier());
        checkLoginLockout(normalizedIdentifier, clientIp);

        Member member = findMemberByIdentifier(normalizedIdentifier)
                .orElseGet(() -> {
                    recordLoginFailure(normalizedIdentifier, clientIp);
                    auditLogService.record(null, "LOGIN_FAILURE", "AUTH", null, "identifier=" + maskIdentifier(normalizedIdentifier), clientIp);
                    throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다.");
                });

        if (!passwordEncoder.matches(request.password(), member.getPassword())) {
            recordLoginFailure(normalizedIdentifier, clientIp);
            auditLogService.record(member.getStudentId(), "LOGIN_FAILURE", "AUTH", null, "bad_credentials", clientIp);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        // After the password check: ban status is a moderation decision, so only disclose it to
        // someone who proved they own the account — otherwise a known 학번 is an unthrottled
        // ban-status oracle (the ban branch never records a login failure).
        bannedStudentService.ensureNotBanned(member.getStudentId());

        if (requiresEmailVerification(member)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "이메일 인증이 완료되지 않았습니다. 가입 시 받은 인증 이메일을 확인해주세요.");
        }

        try {
            member.setLastLoginAt(LocalDateTime.now());
            member.setLastLoginIp(clientIp);
            memberRepository.save(member);
        } catch (Exception ignored) {
            // audit write failure must not block login
        }
        auditLogService.record(member.getStudentId(), member.getRole() == Member.Role.ADMIN ? "ADMIN_LOGIN_SUCCESS" : "LOGIN_SUCCESS",
                "AUTH", null, null, clientIp);

        // Each login opens its own refresh-session family, so logging out on one device (or
        // detecting a stolen token there) leaves the member's other devices signed in.
        RefreshSessionService.Result session =
                refreshSessionService.openSession(member.getStudentId(), request.rememberMe());
        String token = jwtTokenProvider.generateToken(member.getStudentId(), member.getTokenVersion(), session.family());
        String refreshToken = jwtTokenProvider.generateRefreshToken(
                member.getStudentId(), request.rememberMe(), member.getTokenVersion(), session.jti(), session.family());
        return new AuthResponse(token, member.getStudentId(), member.getName(), "로그인 성공", refreshToken);
    }

    private void checkLoginLockout(String identifier, String clientIp) {
        LocalDateTime windowStart = LocalDateTime.now().minusMinutes(LOCKOUT_WINDOW_MINUTES);
        long identifierFailures = identifier == null ? 0 : loginFailureRepository.countByStudentIdAndAttemptedAtAfter(identifier, windowStart);
        long ipFailures = normalizeNullable(clientIp) == null ? 0 : loginFailureRepository.countByIpAndAttemptedAtAfter(clientIp, windowStart);
        if (identifierFailures >= MAX_FAILURES_PER_ID || ipFailures >= MAX_FAILURES_PER_IP) {
            if (identifierFailures >= MAX_FAILURES_PER_ID) {
                log.warn("Rate limit rejected: limiter=login-lockout-identifier key={}", maskAccountKey(identifier));
            }
            if (ipFailures >= MAX_FAILURES_PER_IP) {
                log.warn("Rate limit rejected: limiter=login-lockout-ip key={}", maskIp(clientIp));
            }
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "로그인 시도 횟수가 초과되었습니다. " + LOCKOUT_WINDOW_MINUTES + "분 후 다시 시도해주세요.");
        }
    }

    private void recordLoginFailure(String identifier, String clientIp) {
        loginFailureRepository.save(new LoginFailure(identifier, clientIp));
    }

    private java.util.Optional<Member> findMemberByIdentifier(String identifier) {
        String normalized = normalizeNullable(identifier);
        if (normalized == null) {
            return java.util.Optional.empty();
        }
        return memberRepository.findByStudentId(normalized)
                .or(() -> memberRepository.findByEmailIgnoreCase(normalized));
    }

    private String normalizeLoginIdentifier(String identifier) {
        String normalized = normalizeNullable(identifier);
        if (normalized == null) {
            return null;
        }
        return normalized.contains("@") ? normalized.toLowerCase(Locale.ROOT) : normalized;
    }

    private String maskIdentifier(String identifier) {
        String normalized = normalizeNullable(identifier);
        if (normalized == null) {
            return "blank";
        }
        if (normalized.length() <= 3) {
            return "***";
        }
        return normalized.substring(0, 3) + "***";
    }

    public MemberResponse getMe(String studentId) {
        bannedStudentService.ensureNotBanned(studentId);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return new MemberResponse(
                member.getId(),
                member.getStudentId(),
                member.getName(),
                member.getEmail(),
                member.isEmailVerified(),
                member.getDepartment(),
                member.getGeneration(),
                member.getPhone(),
                member.getRole().name(),
                member.getAspiration(),
                member.getInterests(),
                member.getSelectedFontId(),
                member.getSelectedBuiltinFontKey()
        );
    }

    public void changePassword(String studentId, String currentPassword, String newPassword) {
        bannedStudentService.ensureNotBanned(studentId);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!passwordEncoder.matches(currentPassword, member.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "현재 비밀번호가 올바르지 않습니다.");
        }
        member.setPassword(passwordEncoder.encode(newPassword));
        member.incrementTokenVersion();
        memberRepository.save(member);
        refreshSessionService.revokeAllForStudent(member.getStudentId());
    }

    public void requestPasswordReset(String studentId, String email) {
        String normalizedEmail = normalizeNullable(email);
        if (normalizedEmail == null) {
            return;
        }

        findPasswordResetMember(studentId, normalizedEmail)
                .filter(member -> !bannedStudentService.isBanned(member.getStudentId()))
                .ifPresent(member -> {
                    if (isPasswordResetResendOnCooldown(member)) {
                        return;
                    }
                    String code = newSixDigitCode();
                    member.setPasswordResetCodeHash(passwordEncoder.encode(code));
                    member.setPasswordResetExpiresAt(LocalDateTime.now().plusMinutes(PASSWORD_RESET_EXPIRES_MINUTES));
                    member.resetPasswordResetAttempts();
                    memberRepository.save(member);
                    emailVerificationSender.sendPasswordResetCode(member.getEmail(), code);
                });
    }

    public void confirmPasswordReset(String studentId, String email, String code, String newPassword) {
        String normalizedEmail = normalizeNullable(email);
        if (normalizedEmail == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "인증 정보가 올바르지 않습니다.");
        }

        Member member = findPasswordResetMember(studentId, normalizedEmail)
                .flatMap(found -> memberRepository.findWithLockById(found.getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "인증 정보가 올바르지 않습니다."));
        bannedStudentService.ensureNotBanned(member.getStudentId());

        if (member.getPasswordResetCodeHash() == null || member.getPasswordResetExpiresAt() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "먼저 비밀번호 재설정 인증코드를 요청해주세요.");
        }
        if (member.getPasswordResetExpiresAt().isBefore(LocalDateTime.now())) {
            clearPasswordResetCode(member);
            memberRepository.save(member);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호 재설정 인증코드가 만료되었습니다.");
        }
        if (!passwordEncoder.matches(code, member.getPasswordResetCodeHash())) {
            if (member.incrementPasswordResetAttempts() >= MAX_PASSWORD_RESET_ATTEMPTS) {
                clearPasswordResetCode(member);
            }
            memberRepository.save(member);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호 재설정 인증코드가 올바르지 않습니다.");
        }

        member.setPassword(passwordEncoder.encode(newPassword));
        member.incrementTokenVersion();
        member.resetPasswordResetAttempts();
        clearPasswordResetCode(member);
        memberRepository.save(member);
        refreshSessionService.revokeAllForStudent(member.getStudentId());
    }

    public MemberResponse updateProfile(String studentId, UpdateProfileRequest request) {
        bannedStudentService.ensureNotBanned(studentId);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        member.setPhone(normalizeNullable(request.phone()));
        member.setAspiration(normalizeNullable(request.aspiration()));
        member.setInterests(normalizeNullable(request.interests()));
        if (request.selectedFontId() != null && request.selectedBuiltinFontKey() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose only one font preference.");
        }
        if (!fontService.isSelectable(request.selectedFontId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected font is not available.");
        }
        if (!fontService.isSelectableBuiltIn(request.selectedBuiltinFontKey())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Built-in font is not available.");
        }
        member.setSelectedFontId(request.selectedFontId());
        member.setSelectedBuiltinFontKey(request.selectedBuiltinFontKey());
        memberRepository.save(member);
        return new MemberResponse(
                member.getId(),
                member.getStudentId(),
                member.getName(),
                member.getEmail(),
                member.isEmailVerified(),
                member.getDepartment(),
                member.getGeneration(),
                member.getPhone(),
                member.getRole().name(),
                member.getAspiration(),
                member.getInterests(),
                member.getSelectedFontId(),
                member.getSelectedBuiltinFontKey()
        );
    }

    public boolean requestSignupEmailVerification(String studentId, String clientIp) {
        return pendingSignupService.resend(studentId, clientIp);
    }

    public boolean confirmSignupEmailVerification(String studentId, String code) {
        return pendingSignupService.confirm(studentId, code);
    }

    public boolean requestEmailVerification(String studentId) {
        bannedStudentService.ensureNotBanned(studentId);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (member.isEmailVerified()) {
            return true;
        }

        enforceEmailVerificationResendCooldown(member);
        String code = newSixDigitCode();
        member.setEmailVerificationCodeHash(passwordEncoder.encode(code));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES));
        member.resetEmailVerificationAttempts();
        memberRepository.save(member);
        emailVerificationSender.sendVerificationCode(member.getEmail(), code);
        return false;
    }

    public boolean confirmEmailVerification(String studentId, String code) {
        Member member = findMemberByIdentifier(studentId)
                .flatMap(found -> memberRepository.findWithLockById(found.getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        bannedStudentService.ensureNotBanned(member.getStudentId());

        if (member.isEmailVerified()) {
            return true;
        }
        if (member.getEmailVerificationCodeHash() == null || member.getEmailVerificationExpiresAt() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "먼저 이메일 인증코드를 요청해주세요.");
        }
        if (member.getEmailVerificationExpiresAt().isBefore(LocalDateTime.now())) {
            clearEmailVerificationCode(member);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이메일 인증코드가 만료되었습니다.");
        }
        if (!passwordEncoder.matches(code, member.getEmailVerificationCodeHash())) {
            if (member.incrementEmailVerificationAttempts() >= MAX_EMAIL_VERIFICATION_ATTEMPTS) {
                clearEmailVerificationCode(member);
            }
            memberRepository.save(member);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이메일 인증코드가 올바르지 않습니다.");
        }

        member.setEmailVerified(true);
        member.resetEmailVerificationAttempts();
        clearEmailVerificationCode(member);
        memberRepository.save(member);
        return true;
    }

    private void clearEmailVerificationCode(Member member) {
        member.setEmailVerificationCodeHash(null);
        member.setEmailVerificationExpiresAt(null);
    }

    private void clearPasswordResetCode(Member member) {
        member.setPasswordResetCodeHash(null);
        member.setPasswordResetExpiresAt(null);
    }

    private boolean requiresEmailVerification(Member member) {
        return member.getRole() != Member.Role.ADMIN && !member.isEmailVerified();
    }

    public void ensureAccountNotBanned(String studentId) {
        bannedStudentService.ensureNotBanned(studentId);
    }

    /**
     * Revokes every session of the member on every device by bumping the token version (which
     * invalidates already-issued access tokens too) and revoking their refresh-session rows.
     * Per-device logout uses {@link RefreshSessionService#revokeFamily(String)} instead.
     */
    public void revokeAllSessions(String studentId) {
        memberRepository.findByStudentId(studentId).ifPresent(member -> {
            member.incrementTokenVersion();
            memberRepository.save(member);
        });
        refreshSessionService.revokeAllForStudent(studentId);
    }

    /** Current token version for the member, or 0 if not found. */
    @Transactional(readOnly = true)
    public int getCurrentTokenVersion(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .map(Member::getTokenVersion)
                .orElse(0);
    }

    private void enforceEmailVerificationResendCooldown(Member member) {
        LocalDateTime expiresAt = member.getEmailVerificationExpiresAt();
        if (member.getEmailVerificationCodeHash() == null || expiresAt == null) {
            return;
        }

        LocalDateTime cooldownBoundary = LocalDateTime.now()
                .plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES - EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES);
        if (expiresAt.isAfter(cooldownBoundary)) {
            log.warn("Rate limit rejected: limiter=email-verification-cooldown key={}",
                    maskAccountKey(member.getStudentId()));
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "이메일 인증코드는 1분 후 다시 요청할 수 있습니다.");
        }
    }

    private boolean isPasswordResetResendOnCooldown(Member member) {
        LocalDateTime expiresAt = member.getPasswordResetExpiresAt();
        if (member.getPasswordResetCodeHash() == null || expiresAt == null) {
            return false;
        }

        LocalDateTime cooldownBoundary = LocalDateTime.now()
                .plusMinutes(PASSWORD_RESET_EXPIRES_MINUTES - PASSWORD_RESET_RESEND_COOLDOWN_MINUTES);
        return expiresAt.isAfter(cooldownBoundary);
    }

    private boolean emailMatches(Member member, String email) {
        return member.getEmail() != null && member.getEmail().equalsIgnoreCase(email);
    }

    private java.util.Optional<Member> findPasswordResetMember(String studentId, String email) {
        String normalizedStudentId = normalizeNullable(studentId);
        if (normalizedStudentId != null) {
            return memberRepository.findByStudentId(normalizedStudentId)
                    .filter(member -> emailMatches(member, email));
        }
        return memberRepository.findByEmailIgnoreCase(email);
    }

    private String newSixDigitCode() {
        return String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
    }

    /** Masks an IPv4 client key for rate-limit logs (e.g. 203.0.x.x); never logs raw IPv6/unknown values. */
    private static String maskIp(String ip) {
        if (ip == null || ip.isBlank()) {
            return "unknown";
        }
        String[] octets = ip.split("\\.");
        if (octets.length == 4) {
            return octets[0] + "." + octets[1] + ".x.x";
        }
        return "masked";
    }

    /** Masks a studentId/identifier client key for rate-limit logs (e.g. 2026***). */
    private static String maskAccountKey(String key) {
        if (key == null || key.isBlank()) {
            return "unknown";
        }
        String trimmed = key.trim();
        return trimmed.substring(0, Math.min(4, trimmed.length())) + "***";
    }

    private String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @Override
    public UserDetails loadUserByUsername(String studentId) throws UsernameNotFoundException {
        if (bannedStudentService.isBanned(studentId)) {
            throw new UsernameNotFoundException("차단된 계정입니다: " + studentId);
        }
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다: " + studentId));

        return User.builder()
                .username(member.getStudentId())
                .password(member.getPassword())
                .roles(member.getRole().name())
                .build();
    }
}
