package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService implements UserDetailsService {

    private final MemberRepository memberRepository;
    private final EligibleMemberService eligibleMemberService;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthService(MemberRepository memberRepository,
                       EligibleMemberService eligibleMemberService,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider jwtTokenProvider) {
        this.memberRepository = memberRepository;
        this.eligibleMemberService = eligibleMemberService;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    public AuthResponse signup(SignupRequest request) {
        if (memberRepository.existsByStudentId(request.studentId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 가입된 학번입니다.");
        }
        if (memberRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }
        eligibleMemberService.validateSignup(request.studentId(), request.name(), request.phone());

        Member member = new Member();
        member.setStudentId(request.studentId().trim());
        member.setName(request.name().trim());
        member.setEmail(request.email().trim());
        member.setPassword(passwordEncoder.encode(request.password()));
        member.setDepartment(request.department() == null ? null : request.department().trim());
        member.setPhone(request.phone() == null ? null : request.phone().trim());
        memberRepository.save(member);

        return new AuthResponse(null, member.getStudentId(), member.getName(), "회원가입 신청이 완료되었습니다.");
    }

    public AuthResponse login(LoginRequest request) {
        Member member = memberRepository.findByStudentId(request.identifier())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.password(), member.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다.");
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
                member.getDepartment(),
                member.getPhone(),
                member.getRole().name()
        );
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
