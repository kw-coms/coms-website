package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.RoleUpdateRequest;
import com.coms.backend.repository.MemberRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final MemberRepository memberRepository;

    public AdminController(MemberRepository memberRepository) {
        this.memberRepository = memberRepository;
    }

    @GetMapping("/members")
    public ResponseEntity<List<MemberResponse>> members() {
        return ResponseEntity.ok(memberRepository.findAll().stream().map(this::toResponse).toList());
    }

    @PatchMapping("/members/{id}/role")
    @Transactional
    public ResponseEntity<MemberResponse> updateRole(@PathVariable Long id,
                                                     @Valid @RequestBody RoleUpdateRequest request) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        try {
            member.setRole(Member.Role.valueOf(request.role().trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role.");
        }
        return ResponseEntity.ok(toResponse(memberRepository.save(member)));
    }

    @DeleteMapping("/members/{id}")
    public ResponseEntity<Void> deleteMember(@PathVariable Long id) {
        if (!memberRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        memberRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private MemberResponse toResponse(Member member) {
        return new MemberResponse(
                member.getStudentId(),
                member.getName(),
                member.getEmail(),
                member.getDepartment(),
                member.getPhone(),
                member.getRole().name()
        );
    }
}
