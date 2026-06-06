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
import java.time.LocalDateTime;

@Service
@Transactional
public class AuthService implements UserDetailsService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int EMAIL_VERIFICATION_EXPIRES_MINUTES = 10;
    private static final int EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES = 1;
    private static final int MAX_FAILURES_PER_ID = 5;
    private static final int LOCKOUT_WINDOW_MINUTES = 15;

    private final MemberRepository memberRepository;
    private final LoginFailureRepository loginFailureRepository;
    private final EligibleMemberService eligibleMemberService;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final EmailVerificationSender emailVerificationSender;
    private final FontService fontService;
    private final BannedStudentService bannedStudentService;

    public AuthService(MemberRepository memberRepository,
                       LoginFailureRepository loginFailureRepository,
                       EligibleMemberService eligibleMemberService,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider jwtTokenProvider,
                       EmailVerificationSender emailVerificationSender,
                       FontService fontService,
                       BannedStudentService bannedStudentService) {
        this.memberRepository = memberRepository;
        this.loginFailureRepository = loginFailureRepository;
        this.eligibleMemberService = eligibleMemberService;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.emailVerificationSender = emailVerificationSender;
        this.fontService = fontService;
        this.bannedStudentService = bannedStudentService;
    }

    public AuthResponse signup(SignupRequest request) {
        bannedStudentService.ensureNotBanned(request.studentId().trim());
        if (memberRepository.existsByStudentId(request.studentId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 가입된 학번입니다.");
        }
        if (memberRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }
        eligibleMemberService.validateAndClaimSignup(
                request.studentId(),
                request.name(),
                request.graduateVerificationType(),
                request.graduateVerificationValue()
        );

        Member member = new Member();
        member.setStudentId(request.studentId().trim());
        member.setName(request.name().trim());
        member.setEmail(request.email().trim());
        member.setEmailVerified(false);
        member.setPassword(passwordEncoder.encode(request.password()));
        member.setDepartment(request.department() == null ? null : request.department().trim());
        member.setPhone(request.phone() == null ? null : request.phone().trim());
        member.setAspiration(request.aspiration() == null ? null : request.aspiration().trim());
        member.setInterests(request.interests() == null ? null : request.interests().trim());
        memberRepository.save(member);

        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        member.setEmailVerificationCodeHash(passwordEncoder.encode(code));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES));
        memberRepository.save(member);
        emailVerificationSender.sendVerificationCode(member.getEmail(), code);

        return new AuthResponse(null, member.getStudentId(), member.getName(), "회원가입 신청이 완료되었습니다.");
    }

    public AuthResponse login(LoginRequest request, String clientIp) {
        checkLoginLockout(request.identifier(), clientIp);

        Member member = memberRepository.findByStudentId(request.identifier())
                .orElseGet(() -> {
                    loginFailureRepository.save(new LoginFailure(request.identifier(), clientIp));
                    throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다.");
                });

        bannedStudentService.ensureNotBanned(member.getStudentId());

        if (!passwordEncoder.matches(request.password(), member.getPassword())) {
            loginFailureRepository.save(new LoginFailure(request.identifier(), clientIp));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다.");
        }

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

        String token = jwtTokenProvider.generateToken(member.getStudentId());
        String refreshToken = jwtTokenProvider.generateRefreshToken(member.getStudentId(), request.rememberMe());
        return new AuthResponse(token, member.getStudentId(), member.getName(), "로그인 성공", refreshToken);
    }

    private void checkLoginLockout(String studentId, String clientIp) {
        LocalDateTime windowStart = LocalDateTime.now().minusMinutes(LOCKOUT_WINDOW_MINUTES);
        long failures = loginFailureRepository.countByStudentIdAndAttemptedAtAfter(studentId, windowStart);
        if (failures >= MAX_FAILURES_PER_ID) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "로그인 시도 횟수가 초과되었습니다. " + LOCKOUT_WINDOW_MINUTES + "분 후 다시 시도해주세요.");
        }
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
                member.getPhone(),
                member.getRole().name(),
                member.getAspiration(),
                member.getInterests(),
                member.getSelectedFontId()
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
        memberRepository.save(member);
    }

    public MemberResponse updateProfile(String studentId, UpdateProfileRequest request) {
        bannedStudentService.ensureNotBanned(studentId);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        member.setPhone(normalizeNullable(request.phone()));
        member.setAspiration(normalizeNullable(request.aspiration()));
        member.setInterests(normalizeNullable(request.interests()));
        if (!fontService.isSelectable(request.selectedFontId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected font is not available.");
        }
        member.setSelectedFontId(request.selectedFontId());
        memberRepository.save(member);
        return new MemberResponse(
                member.getId(),
                member.getStudentId(),
                member.getName(),
                member.getEmail(),
                member.isEmailVerified(),
                member.getDepartment(),
                member.getPhone(),
                member.getRole().name(),
                member.getAspiration(),
                member.getInterests(),
                member.getSelectedFontId()
        );
    }

    public boolean requestSignupEmailVerification(String studentId) {
        bannedStudentService.ensureNotBanned(studentId);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        if (member.isEmailVerified()) {
            return true;
        }
        enforceEmailVerificationResendCooldown(member);
        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        member.setEmailVerificationCodeHash(passwordEncoder.encode(code));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES));
        memberRepository.save(member);
        emailVerificationSender.sendVerificationCode(member.getEmail(), code);
        return false;
    }

    public boolean confirmSignupEmailVerification(String studentId, String code) {
        bannedStudentService.ensureNotBanned(studentId);
        return confirmEmailVerification(studentId, code);
    }

    public boolean requestEmailVerification(String studentId) {
        bannedStudentService.ensureNotBanned(studentId);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (member.isEmailVerified()) {
            return true;
        }

        enforceEmailVerificationResendCooldown(member);
        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        member.setEmailVerificationCodeHash(passwordEncoder.encode(code));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES));
        memberRepository.save(member);
        emailVerificationSender.sendVerificationCode(member.getEmail(), code);
        return false;
    }

    public boolean confirmEmailVerification(String studentId, String code) {
        bannedStudentService.ensureNotBanned(studentId);
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이메일 인증코드가 올바르지 않습니다.");
        }

        member.setEmailVerified(true);
        clearEmailVerificationCode(member);
        memberRepository.save(member);
        return true;
    }

    private void clearEmailVerificationCode(Member member) {
        member.setEmailVerificationCodeHash(null);
        member.setEmailVerificationExpiresAt(null);
    }

    private boolean requiresEmailVerification(Member member) {
        return member.getRole() != Member.Role.ADMIN && !member.isEmailVerified();
    }

    public void ensureAccountNotBanned(String studentId) {
        bannedStudentService.ensureNotBanned(studentId);
    }

    private void enforceEmailVerificationResendCooldown(Member member) {
        LocalDateTime expiresAt = member.getEmailVerificationExpiresAt();
        if (member.getEmailVerificationCodeHash() == null || expiresAt == null) {
            return;
        }

        LocalDateTime cooldownBoundary = LocalDateTime.now()
                .plusMinutes(EMAIL_VERIFICATION_EXPIRES_MINUTES - EMAIL_VERIFICATION_RESEND_COOLDOWN_MINUTES);
        if (expiresAt.isAfter(cooldownBoundary)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "이메일 인증코드는 1분 후 다시 요청할 수 있습니다.");
        }
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
