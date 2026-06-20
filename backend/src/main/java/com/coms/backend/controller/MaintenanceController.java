package com.coms.backend.controller;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.service.EligibleMemberService;
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
    private final EligibleMemberService eligibleMemberService;

    @Value("${bootstrap.secret:}")
    private String bootstrapSecret;

    public MaintenanceController(MemberRepository memberRepository,
                                  EligibleMemberRepository eligibleMemberRepository,
                                  PasswordEncoder passwordEncoder,
                                  EligibleMemberService eligibleMemberService) {
        this.memberRepository = memberRepository;
        this.eligibleMemberRepository = eligibleMemberRepository;
        this.passwordEncoder = passwordEncoder;
        this.eligibleMemberService = eligibleMemberService;
    }

    record BootstrapRequest(
        @NotBlank String studentId,
        @NotBlank String name,
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8) String password
    ) {}

    record EligibleRequest(
        @NotBlank String studentId,
        @NotBlank String name
    ) {}

    private void verifyBootstrapSecret(String providedSecret) {
        if (bootstrapSecret.length() < 32) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        byte[] expected = bootstrapSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] provided = (providedSecret == null ? "" : providedSecret)
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        if (!java.security.MessageDigest.isEqual(expected, provided)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    /**
     * One-time admin bootstrap. Disabled permanently once any admin account exists.
     */
    @PostMapping("/bootstrap")
    public ResponseEntity<Map<String, String>> bootstrap(
            @RequestHeader(value = "X-Bootstrap-Secret", required = false) String providedSecret,
            @Valid @RequestBody BootstrapRequest req) {
        verifyBootstrapSecret(providedSecret);
        boolean adminExists = memberRepository.existsByRole(Member.Role.ADMIN);
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
            existing.setEmailVerified(true);
            memberRepository.save(existing);
            return ResponseEntity.ok(Map.of("message", "Existing account promoted to ADMIN."));
        }

        Member admin = new Member();
        admin.setStudentId(req.studentId());
        admin.setName(req.name());
        admin.setEmail(req.email());
        admin.setPassword(passwordEncoder.encode(req.password()));
        admin.setRole(Member.Role.ADMIN);
        admin.setEmailVerified(true);
        memberRepository.save(admin);

        return ResponseEntity.ok(Map.of("message", "Admin account created. Bootstrap complete."));
    }

    /**
     * Upsert a single eligible member. Admin-only via Spring Security and never open
     * when BOOTSTRAP_SECRET is missing.
     */
    @PostMapping("/add-eligible")
    public ResponseEntity<Map<String, String>> addEligible(
            @RequestHeader(value = "X-Bootstrap-Secret", required = false) String providedSecret,
            @Valid @RequestBody EligibleRequest req) {
        verifyBootstrapSecret(providedSecret);
        boolean nameAlreadyCorrect = eligibleMemberRepository.findByStudentId(req.studentId())
                .map(member -> req.name().equals(member.getName()))
                .orElse(false);
        eligibleMemberService.addSingle(req.studentId(), req.name());
        return ResponseEntity.ok(Map.of(
                "message", nameAlreadyCorrect ? "Already in roster." : "Upserted.",
                "studentId", req.studentId(),
                "name", req.name()
        ));
    }
}
