package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.RoleUpdateRequest;
import com.coms.backend.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class AdminService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminService(MemberRepository memberRepository, PasswordEncoder passwordEncoder) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> listMembers() {
        return memberRepository.findAll().stream().map(this::toResponse).toList();
    }

    public MemberResponse updateRole(Long id, RoleUpdateRequest request) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        try {
            member.setRole(Member.Role.valueOf(request.role().trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role.");
        }
        return toResponse(memberRepository.save(member));
    }

    public void deleteMember(Long id) {
        if (!memberRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        memberRepository.deleteById(id);
    }

    public void resetPassword(Long id, String newPassword) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        member.setPassword(passwordEncoder.encode(newPassword));
        memberRepository.save(member);
    }

    private MemberResponse toResponse(Member member) {
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
}
