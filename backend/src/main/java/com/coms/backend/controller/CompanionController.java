package com.coms.backend.controller;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.service.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.Optional;

@RestController
public class CompanionController {
    private static final Set<String> MEMBER_ROLES = Set.of("ASSOCIATE", "USER", "OFFICER", "VICE_PRESIDENT", "ADMIN");
    private final AuthService authService;
    private final EligibleMemberRepository eligibleMemberRepository;

    public CompanionController(AuthService authService, EligibleMemberRepository eligibleMemberRepository) {
        this.authService = authService;
        this.eligibleMemberRepository = eligibleMemberRepository;
    }

    @GetMapping("/api/companion/me")
    public CompanionMember companionMe(Authentication authentication) {
        MemberResponse account = authService.getMe(authentication.getName());
        if ((!account.emailVerified() && !"ADMIN".equals(account.role()))
                || account.role() == null || !MEMBER_ROLES.contains(account.role())) {
            throw unavailable();
        }

        String studentId = account.studentId();
        if (studentId == null || studentId.isBlank() || studentId.length() > 255) {
            throw unavailable();
        }
        Optional<EligibleMember> direct = eligibleMemberRepository.findByStudentId(studentId);
        EligibleMember eligible;
        if (studentId.matches("G[0-9]{4}-[1-9][0-9]*")) {
            int separator = studentId.indexOf('-');
            try {
                int year = Integer.parseInt(studentId.substring(1, separator));
                long id = Long.parseLong(studentId.substring(separator + 1));
                eligible = eligibleMemberRepository.findById(id).orElseThrow(CompanionController::unavailable);
                if (eligible.getAdmissionYear() == null || eligible.getAdmissionYear() != year
                        || (eligible.getStudentId() != null && !eligible.getStudentId().isBlank()
                            && !studentId.equals(eligible.getStudentId()))
                        || (direct.isPresent() && !direct.get().getId().equals(eligible.getId()))) {
                    throw unavailable();
                }
            } catch (NumberFormatException ex) {
                throw unavailable();
            }
        } else {
            eligible = direct.orElseThrow(CompanionController::unavailable);
        }
        return new CompanionMember("coms-eligible-members", eligible.getId().toString(), eligible.getName());
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "등록된 회원 계정이 아닙니다.");
    }

    public record CompanionMember(String source, String sourceId, String name) {}
}
