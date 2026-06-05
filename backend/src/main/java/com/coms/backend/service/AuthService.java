package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.dto.UpdateProfileRequest;
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
import java.time.LocalDateTime;

@Service
@Transactional
public class AuthService implements UserDetailsService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final MemberRepository memberRepository;
    private final EligibleMemberService eligibleMemberService;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final EmailVerificationSender emailVerificationSender;

    public AuthService(MemberRepository memberRepository,
                       EligibleMemberService eligibleMemberService,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider jwtTokenProvider,
                       EmailVerificationSender emailVerificationSender) {
        this.memberRepository = memberRepository;
        this.eligibleMemberService = eligibleMemberService;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.emailVerificationSender = emailVerificationSender;
    }

    public AuthResponse signup(SignupRequest request) {
        if (memberRepository.existsByStudentId(request.studentId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 가입된 학번입니다.");
        }
        if (memberRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }
        eligibleMemberService.validateSignup(request.studentId(), request.name());

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

        try {
            String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
            member.setEmailVerificationCodeHash(passwordEncoder.encode(code));
            member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(10));
            memberRepository.save(member);
            emailVerificationSender.sendVerificationCode(member.getEmail(), code);
        } catch (Exception e) {
            log.warn("Failed to auto-send verification email during signup for {}", member.getEmail(), e);
        }

        return new AuthResponse(null, member.getStudentId(), member.getName(), "회원가입 신청이 완료되었습니다.");
    }

    public AuthResponse login(LoginRequest request) {
        Member member = memberRepository.findByStudentId(request.identifier())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.password(), member.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        if (!member.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "이메일 인증이 완료되지 않았습니다. 가입 시 받은 인증 이메일을 확인해주세요.");
        }

        String token = jwtTokenProvider.generateToken(member.getStudentId());
        return new AuthResponse(token, member.getStudentId(), member.getName(), "로그인 성공");
    }

    public MemberResponse getMe(String studentId) {
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
                member.getInterests()
        );
    }

    public void changePassword(String studentId, String currentPassword, String newPassword) {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!passwordEncoder.matches(currentPassword, member.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "현재 비밀번호가 올바르지 않습니다.");
        }
        member.setPassword(passwordEncoder.encode(newPassword));
        memberRepository.save(member);
    }

    public MemberResponse updateProfile(String studentId, UpdateProfileRequest request) {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        member.setPhone(normalizeNullable(request.phone()));
        member.setAspiration(normalizeNullable(request.aspiration()));
        member.setInterests(normalizeNullable(request.interests()));
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
                member.getInterests()
        );
    }

    public boolean requestSignupEmailVerification(String studentId) {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
        if (member.isEmailVerified()) {
            return true;
        }
        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        member.setEmailVerificationCodeHash(passwordEncoder.encode(code));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(10));
        memberRepository.save(member);
        emailVerificationSender.sendVerificationCode(member.getEmail(), code);
        return false;
    }

    public boolean confirmSignupEmailVerification(String studentId, String code) {
        return confirmEmailVerification(studentId, code);
    }

    public boolean requestEmailVerification(String studentId) {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (member.isEmailVerified()) {
            return true;
        }

        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        member.setEmailVerificationCodeHash(passwordEncoder.encode(code));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(10));
        memberRepository.save(member);
        emailVerificationSender.sendVerificationCode(member.getEmail(), code);
        return false;
    }

    public boolean confirmEmailVerification(String studentId, String code) {
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

    private String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @Override
    public UserDetails loadUserByUsername(String studentId) throws UsernameNotFoundException {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다: " + studentId));

        return User.builder()
                .username(member.getStudentId())
                .password(member.getPassword())
                .roles(member.getRole().name())
                .build();
    }
}
