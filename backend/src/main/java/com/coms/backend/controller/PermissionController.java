package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.MemberPermissionOverride;
import com.coms.backend.domain.MemberPermissionOverride.Effect;
import com.coms.backend.domain.Permission;
import com.coms.backend.dto.MemberPermissionResponse;
import com.coms.backend.dto.MemberPermissionSummary;
import com.coms.backend.dto.MemberPermissionUpdateRequest;
import com.coms.backend.dto.MyPermissionsResponse;
import com.coms.backend.dto.PermissionMatrixResponse;
import com.coms.backend.dto.PermissionMatrixUpdateRequest;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.service.PermissionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api")
public class PermissionController {

    private final PermissionService permissionService;
    private final MemberRepository memberRepository;

    public PermissionController(PermissionService permissionService, MemberRepository memberRepository) {
        this.permissionService = permissionService;
        this.memberRepository = memberRepository;
    }

    @GetMapping("/permissions/me")
    public ResponseEntity<MyPermissionsResponse> me(Authentication authentication) {
        Member member = memberRepository.findByStudentId(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return ResponseEntity.ok(MyPermissionsResponse.from(member, permissionService.effective(member)));
    }

    @GetMapping("/admin/permissions")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PermissionMatrixResponse> matrix() {
        return ResponseEntity.ok(permissionService.matrix());
    }

    @PutMapping("/admin/permissions")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PermissionMatrixResponse> replace(@RequestBody PermissionMatrixUpdateRequest request,
                                                            Authentication authentication) {
        return ResponseEntity.ok(permissionService.replace(
                parse(request), authentication.getName(), request.expectedUpdatedAt()));
    }

    @GetMapping("/admin/permissions/members")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<MemberPermissionSummary>> members(@RequestParam(defaultValue = "") String query) {
        String term = query.trim();
        if (term.length() > 100) throw badRequest("검색어는 100자 이하여야 합니다.");
        return ResponseEntity.ok(memberRepository
                .findTop20ByNameContainingIgnoreCaseOrStudentIdContainingIgnoreCaseOrderByNameAsc(term, term)
                .stream().map(member -> new MemberPermissionSummary(
                        member.getStudentId(), member.getName(), member.getRole().name(), Map.of())).toList());
    }

    @GetMapping("/admin/permissions/overrides")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<MemberPermissionSummary>> overrides() {
        Map<String, Map<String, String>> grouped = new java.util.LinkedHashMap<>();
        for (MemberPermissionOverride row : permissionService.overrides()) {
            grouped.computeIfAbsent(row.getId().studentId(), ignored -> new java.util.LinkedHashMap<>())
                    .put(row.getId().permissionKey(), row.getEffect().name());
        }
        Map<String, Member> members = new HashMap<>();
        memberRepository.findByStudentIdIn(grouped.keySet()).forEach(member -> members.put(member.getStudentId(), member));
        return ResponseEntity.ok(grouped.entrySet().stream()
                .filter(entry -> members.containsKey(entry.getKey()))
                .map(entry -> {
                    Member member = members.get(entry.getKey());
                    return new MemberPermissionSummary(member.getStudentId(), member.getName(),
                            member.getRole().name(), entry.getValue());
                }).toList());
    }

    @GetMapping("/admin/permissions/overrides/{studentId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<MemberPermissionResponse> memberOverrides(@PathVariable String studentId) {
        return ResponseEntity.ok(memberPermissions(studentId));
    }

    @PutMapping("/admin/permissions/overrides/{studentId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<MemberPermissionResponse> replaceMemberOverrides(
            @PathVariable String studentId, @RequestBody MemberPermissionUpdateRequest request,
            Authentication authentication) {
        if (request == null || request.overrides() == null) throw badRequest("권한 설정이 비어 있습니다.");
        Member member = findMember(studentId);
        Map<Permission, Effect> parsed = new EnumMap<>(Permission.class);
        for (Map.Entry<String, String> entry : request.overrides().entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null) throw badRequest("권한 값이 올바르지 않습니다.");
            Permission permission = Permission.fromKey(entry.getKey());
            try {
                parsed.put(permission, Effect.valueOf(entry.getValue()));
            } catch (IllegalArgumentException exception) {
                throw badRequest("권한 효과는 GRANT 또는 REVOKE여야 합니다.");
            }
        }
        permissionService.replaceOverrides(member, parsed, authentication.getName());
        return ResponseEntity.ok(memberPermissions(studentId));
    }

    private MemberPermissionResponse memberPermissions(String studentId) {
        Member member = findMember(studentId);
        Map<String, String> overrides = new java.util.LinkedHashMap<>();
        permissionService.overrides(studentId).forEach(row ->
                overrides.put(row.getId().permissionKey(), row.getEffect().name()));
        return new MemberPermissionResponse(member.getStudentId(), member.getName(), member.getRole().name(),
                permissionService.rolePermissions(member.getRole()).stream().map(Permission::key).toList(),
                overrides, permissionService.effective(member).stream().map(Permission::key).toList());
    }

    private Member findMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private Map<Member.Role, Set<Permission>> parse(PermissionMatrixUpdateRequest request) {
        if (request == null || request.allowed() == null) {
            throw badRequest("권한 매트릭스가 비어 있습니다.");
        }
        Set<String> expected = new LinkedHashSet<>(PermissionService.editableRoles().stream().map(Enum::name).toList());
        if (!request.allowed().keySet().equals(expected)) {
            throw badRequest("권한 매트릭스는 준회원, 회원, 임원, 부회장만 포함해야 합니다.");
        }

        Map<Member.Role, Set<Permission>> parsed = new EnumMap<>(Member.Role.class);
        for (Map.Entry<String, List<String>> entry : request.allowed().entrySet()) {
            Member.Role role = parseRole(entry.getKey());
            if (role == Member.Role.ADMIN || !PermissionService.editableRoles().contains(role)) {
                throw badRequest("회장 권한은 편집할 수 없습니다.");
            }
            if (entry.getValue() == null) {
                throw badRequest("권한 목록이 올바르지 않습니다.");
            }
            EnumSet<Permission> permissions = EnumSet.noneOf(Permission.class);
            for (String key : entry.getValue()) {
                if (key == null || key.isBlank()) {
                    throw badRequest("권한 값이 올바르지 않습니다.");
                }
                permissions.add(Permission.fromKey(key));
            }
            parsed.put(role, permissions);
        }
        return parsed;
    }

    private Member.Role parseRole(String role) {
        try {
            return Member.Role.valueOf(role);
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw badRequest("알 수 없는 역할입니다: " + role);
        }
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
