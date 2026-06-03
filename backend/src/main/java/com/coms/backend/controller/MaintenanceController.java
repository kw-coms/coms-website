package com.coms.backend.controller;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.Map;

@RestController
@RequestMapping("/api/maintenance")
public class MaintenanceController {

    private final MemberRepository memberRepository;
    private final EligibleMemberRepository eligibleMemberRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${bootstrap.secret:}")
    private String bootstrapSecret;

    public MaintenanceController(MemberRepository memberRepository,
                                  EligibleMemberRepository eligibleMemberRepository,
                                  PasswordEncoder passwordEncoder) {
        this.memberRepository = memberRepository;
        this.eligibleMemberRepository = eligibleMemberRepository;
        this.passwordEncoder = passwordEncoder;
    }

    record BootstrapRequest(
        @NotBlank String studentId,
        @NotBlank String name,
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8) String password
    ) {}

    /**
     * One-time admin bootstrap. Disabled permanently once any admin account exists.
     */
    @PostMapping("/bootstrap")
    public ResponseEntity<Map<String, String>> bootstrap(
            @RequestHeader(value = "X-Bootstrap-Secret", required = false) String providedSecret,
            @Valid @RequestBody BootstrapRequest req) {
        if (bootstrapSecret.isEmpty() || !bootstrapSecret.equals(providedSecret)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        boolean adminExists = memberRepository.findAll().stream()
                .anyMatch(m -> m.getRole() == Member.Role.ADMIN);
        if (adminExists) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bootstrap already completed.");
        }

        EligibleMember eligible = eligibleMemberRepository
                .findByStudentId(req.studentId())
                .orElseGet(() -> {
                    EligibleMember e = new EligibleMember();
                    e.setStudentId(req.studentId());
                    e.setName(req.name());
                    return eligibleMemberRepository.save(e);
                });

        if (!eligible.getName().equals(req.name())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name does not match existing roster entry.");
        }

        if (memberRepository.existsByStudentId(req.studentId())) {
            Member existing = memberRepository.findByStudentId(req.studentId()).get();
            existing.setRole(Member.Role.ADMIN);
            memberRepository.save(existing);
            return ResponseEntity.ok(Map.of("message", "Existing account promoted to ADMIN."));
        }

        Member admin = new Member();
        admin.setStudentId(req.studentId());
        admin.setName(req.name());
        admin.setEmail(req.email());
        admin.setPassword(passwordEncoder.encode(req.password()));
        admin.setRole(Member.Role.ADMIN);
        memberRepository.save(admin);

        return ResponseEntity.ok(Map.of("message", "Admin account created. Bootstrap complete."));
    }
}
