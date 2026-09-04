package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.domain.RolePermission;
import com.coms.backend.domain.RolePermissionId;
import com.coms.backend.dto.PermissionMatrixResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RolePermissionRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service("perm")
public class PermissionService {

    private static final List<Member.Role> EDITABLE_ROLES = List.of(
            Member.Role.ASSOCIATE,
            Member.Role.USER,
            Member.Role.OFFICER,
            Member.Role.VICE_PRESIDENT
    );

    private final RolePermissionRepository repository;
    private final MemberRepository memberRepository;
    private final AuditLogService auditLogService;
    private final ConcurrentHashMap<RolePermissionId, Boolean> cache = new ConcurrentHashMap<>();

    public PermissionService(RolePermissionRepository repository,
                             MemberRepository memberRepository,
                             AuditLogService auditLogService) {
        this.repository = repository;
        this.memberRepository = memberRepository;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public boolean has(Authentication authentication, Permission permission) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }
        if (authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch("ROLE_ADMIN"::equals)) {
            return true;
        }
        return memberRepository.findByStudentId(authentication.getName())
                .map(member -> has(member, permission))
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean has(Authentication authentication, String permission) {
        return has(authentication, Permission.fromToken(permission));
    }

    @Transactional(readOnly = true)
    public boolean has(Member member, Permission permission) {
        if (member == null || permission == null) {
            return false;
        }
        if (member.getRole() == Member.Role.ADMIN) {
            return true;
        }
        RolePermissionId id = new RolePermissionId(member.getRole(), permission);
        Boolean cached = cache.get(id);
        if (cached != null) {
            return cached;
        }
        return repository.findById(id)
                .map(row -> {
                    cache.put(id, row.isAllowed());
                    return row.isAllowed();
                })
                .orElseGet(() -> permission.defaultRoles().contains(member.getRole()));
    }

    @Transactional(readOnly = true)
    public Set<Permission> effective(Member member) {
        EnumSet<Permission> permissions = EnumSet.noneOf(Permission.class);
        if (member == null) {
            return permissions;
        }
        if (member.getRole() == Member.Role.ADMIN) {
            permissions.addAll(Arrays.asList(Permission.values()));
            return permissions;
        }
        for (Permission permission : Permission.values()) {
            if (has(member, permission)) {
                permissions.add(permission);
            }
        }
        return permissions;
    }

    @Transactional(readOnly = true)
    public PermissionMatrixResponse matrix() {
        return matrixFromRows(repository.findAll());
    }

    @Transactional
    public PermissionMatrixResponse replace(Map<Member.Role, Set<Permission>> allowed, String updatedBy) {
        validateReplacement(allowed);
        Map<Member.Role, Set<Permission>> previous = currentAllowed(repository.findAll());
        LocalDateTime now = LocalDateTime.now();
        List<RolePermission> rows = new ArrayList<>();
        ConcurrentHashMap<RolePermissionId, Boolean> refreshed = new ConcurrentHashMap<>();

        for (Member.Role role : EDITABLE_ROLES) {
            for (Permission permission : Permission.values()) {
                RolePermissionId id = new RolePermissionId(role, permission);
                boolean isAllowed = allowed.get(role).contains(permission);
                RolePermission row = new RolePermission(id);
                row.setAllowed(isAllowed);
                row.setUpdatedAt(now);
                row.setUpdatedBy(updatedBy);
                rows.add(row);
                refreshed.put(id, isAllowed);
            }
        }

        Iterable<RolePermission> saved = repository.saveAll(rows);
        List<RolePermission> savedRows = saved == null ? rows : iterableToList(saved);
        cache.clear();
        cache.putAll(refreshed);
        auditReplacement(previous, allowed, updatedBy);
        return matrixFromRows(savedRows.isEmpty() ? rows : savedRows);
    }

    public static List<Member.Role> editableRoles() {
        return EDITABLE_ROLES;
    }

    private void validateReplacement(Map<Member.Role, Set<Permission>> allowed) {
        if (allowed == null || allowed.size() != EDITABLE_ROLES.size()) {
            throw new ResponseStatusException(BAD_REQUEST, "권한 매트릭스는 네 개 역할을 모두 포함해야 합니다.");
        }
        if (!allowed.keySet().containsAll(EDITABLE_ROLES)) {
            throw new ResponseStatusException(BAD_REQUEST, "권한 매트릭스는 편집 가능한 역할만 포함해야 합니다.");
        }
        if (allowed.containsKey(Member.Role.ADMIN)) {
            throw new ResponseStatusException(BAD_REQUEST, "회장 권한은 편집할 수 없습니다.");
        }
        if (allowed.values().stream().anyMatch(value -> value == null || value.stream().anyMatch(permission -> permission == null))) {
            throw new ResponseStatusException(BAD_REQUEST, "권한 값이 올바르지 않습니다.");
        }
    }

    private PermissionMatrixResponse matrixFromRows(List<RolePermission> rows) {
        List<RolePermission> safeRows = rows == null ? List.of() : rows;
        Map<RolePermissionId, RolePermission> byId = new LinkedHashMap<>();
        for (RolePermission row : safeRows) {
            if (row.getId().getRole() != Member.Role.ADMIN) {
                byId.put(row.getId(), row);
            }
        }

        Map<String, List<String>> allowed = new LinkedHashMap<>();
        for (Member.Role role : EDITABLE_ROLES) {
            List<String> keys = Arrays.stream(Permission.values())
                    .filter(permission -> isAllowed(role, permission, byId.get(new RolePermissionId(role, permission))))
                    .map(Permission::key)
                    .toList();
            allowed.put(role.name(), keys);
        }

        RolePermission latest = safeRows.stream()
                .filter(row -> row.getUpdatedAt() != null)
                .max(Comparator.comparing(RolePermission::getUpdatedAt))
                .orElse(null);

        return new PermissionMatrixResponse(
                EDITABLE_ROLES.stream().map(Enum::name).toList(),
                Arrays.stream(Permission.values())
                        .map(permission -> new PermissionMatrixResponse.PermissionDescriptor(
                                permission.key(),
                                permission.label(),
                                permission.description()
                        ))
                        .toList(),
                allowed,
                latest == null ? null : latest.getUpdatedAt(),
                latest == null ? null : latest.getUpdatedBy()
        );
    }

    private boolean isAllowed(Member.Role role, Permission permission, RolePermission row) {
        return row == null ? permission.defaultRoles().contains(role) : row.isAllowed();
    }

    private Map<Member.Role, Set<Permission>> currentAllowed(List<RolePermission> rows) {
        Map<RolePermissionId, RolePermission> byId = new LinkedHashMap<>();
        if (rows != null) {
            for (RolePermission row : rows) {
                byId.put(row.getId(), row);
            }
        }
        Map<Member.Role, Set<Permission>> allowed = new EnumMap<>(Member.Role.class);
        for (Member.Role role : EDITABLE_ROLES) {
            EnumSet<Permission> rolePermissions = EnumSet.noneOf(Permission.class);
            for (Permission permission : Permission.values()) {
                if (isAllowed(role, permission, byId.get(new RolePermissionId(role, permission)))) {
                    rolePermissions.add(permission);
                }
            }
            allowed.put(role, rolePermissions);
        }
        return allowed;
    }

    private void auditReplacement(Map<Member.Role, Set<Permission>> previous,
                                  Map<Member.Role, Set<Permission>> next,
                                  String updatedBy) {
        List<String> added = new ArrayList<>();
        List<String> removed = new ArrayList<>();
        for (Member.Role role : EDITABLE_ROLES) {
            for (Permission permission : Permission.values()) {
                boolean wasAllowed = previous.getOrDefault(role, Set.of()).contains(permission);
                boolean isAllowed = next.getOrDefault(role, Set.of()).contains(permission);
                if (!wasAllowed && isAllowed) {
                    added.add(role.name() + ":" + permission.key());
                } else if (wasAllowed && !isAllowed) {
                    removed.add(role.name() + ":" + permission.key());
                }
            }
        }
        auditLogService.record(
                updatedBy,
                "ADMIN_PERMISSIONS_UPDATE",
                "ROLE_PERMISSIONS",
                null,
                "added=" + String.join(",", added) + "\nremoved=" + String.join(",", removed),
                null
        );
    }

    private List<RolePermission> iterableToList(Iterable<RolePermission> rows) {
        List<RolePermission> list = new ArrayList<>();
        rows.forEach(list::add);
        return list;
    }
}
