package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.domain.RolePermission;
import com.coms.backend.domain.RolePermissionId;
import com.coms.backend.dto.PermissionMatrixResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RolePermissionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;

@Service("perm")
public class PermissionService {

    private static final Logger log = LoggerFactory.getLogger(PermissionService.class);

    private static final List<Member.Role> EDITABLE_ROLES = List.of(
            Member.Role.ASSOCIATE,
            Member.Role.USER,
            Member.Role.OFFICER,
            Member.Role.VICE_PRESIDENT
    );

    private final RolePermissionRepository repository;
    private final MemberRepository memberRepository;
    private final AuditLogService auditLogService;

    /**
     * Immutable snapshot, swapped in one {@link AtomicReference#set}. A reader always sees either
     * the previous complete matrix or the next one — never a partially-cleared map, which is what
     * a {@code cache.clear(); cache.putAll(refreshed)} two-step would momentarily expose (a revoked
     * permission would read as a cache miss and fall through to the enum default, i.e. fail open).
     */
    private final AtomicReference<Map<RolePermissionId, Boolean>> cacheRef = new AtomicReference<>(Map.of());

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
        return allows(member.getRole(), permission);
    }

    /**
     * 회장(ADMIN)은 항상 통과. 그 외에는 DB 행(캐시 우선). 행이 없으면 — 스키마 드리프트든 아직
     * 시드되지 않았든 — enum 기본값으로 돌아가지 않고 거부한다({@link #selfHealMissingRows()}가
     * 부팅 시 모든 행을 채워 넣으므로 정상 운영 중에는 이 경로를 타지 않는다).
     */
    @Transactional(readOnly = true)
    public boolean allows(Member.Role role, Permission permission) {
        if (role == null || permission == null) {
            return false;
        }
        if (role == Member.Role.ADMIN) {
            return true;
        }
        RolePermissionId id = new RolePermissionId(role, permission);
        Map<RolePermissionId, Boolean> snapshot = cacheRef.get();
        Boolean cached = snapshot.get(id);
        if (cached != null) {
            return cached;
        }
        return repository.findById(id)
                .map(row -> {
                    cacheSingle(id, row.isAllowed());
                    return row.isAllowed();
                })
                .orElse(false);
    }

    /**
     * Copy-on-write insert of a single lazily-resolved entry. Losing a concurrent insert here just
     * costs the next caller an extra repository lookup — it can never resurrect a stale/removed
     * permission, since {@link #replace(Map, String, LocalDateTime)} and {@link #invalidate()} both
     * swap the whole reference afterward.
     */
    private void cacheSingle(RolePermissionId id, boolean allowed) {
        Map<RolePermissionId, Boolean> next = new HashMap<>(cacheRef.get());
        next.put(id, allowed);
        cacheRef.set(Map.copyOf(next));
    }

    /**
     * 해당 권한을 가진 직급 목록 — 회장은 언제나 포함. 알림 수신자처럼
     * "권한 보유자 전체"를 역질의해야 하는 곳에서 쓴다.
     */
    @Transactional(readOnly = true)
    public List<Member.Role> rolesWith(Permission permission) {
        List<Member.Role> roles = new ArrayList<>();
        for (Member.Role role : EDITABLE_ROLES) {
            if (allows(role, permission)) {
                roles.add(role);
            }
        }
        roles.add(Member.Role.ADMIN);
        return roles;
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
    public PermissionMatrixResponse replace(Map<Member.Role, Set<Permission>> allowed,
                                            String updatedBy,
                                            LocalDateTime expectedUpdatedAt) {
        validateReplacement(allowed);
        // Lock the rows for the duration of the transaction so two concurrent PUTs can't both read
        // the same "current" matrix and both believe their expectedUpdatedAt still matches.
        List<RolePermission> lockedRows = repository.findAllForUpdate();
        LocalDateTime currentMaxUpdatedAt = maxUpdatedAt(lockedRows);
        if (!Objects.equals(currentMaxUpdatedAt, expectedUpdatedAt)) {
            throw new ResponseStatusException(CONFLICT, "다른 관리자가 먼저 저장했습니다. 새로 고침 후 다시 시도해주세요.");
        }
        Map<Member.Role, Set<Permission>> previous = currentAllowed(lockedRows);
        // Truncated to microseconds: PostgreSQL/H2 TIMESTAMP columns round-trip at microsecond
        // precision, so a nanosecond-precision LocalDateTime.now() would never compare equal to the
        // value a later expectedUpdatedAt reads back from the database.
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.MICROS);
        List<RolePermission> rows = new ArrayList<>();
        Map<RolePermissionId, Boolean> refreshed = new HashMap<>();

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
        List<RolePermission> savedRows = iterableToList(saved);
        refreshCacheAfterCommit(refreshed);
        auditReplacement(previous, allowed, updatedBy);
        return matrixFromRows(savedRows);
    }

    /**
     * Clears the in-memory permission matrix cache. Callers include
     * {@link CacheMaintenanceService#clearAll()} so an admin's "clear all caches" action also
     * forces a fresh DB read for role permission checks.
     */
    public void invalidate() {
        cacheRef.set(Map.of());
    }

    /**
     * Swaps in the freshly-saved rows only after the surrounding transaction commits — if it were
     * applied eagerly and the transaction then rolled back, the cache would keep serving a matrix
     * that was never actually persisted. Outside a transaction (no active synchronization) the swap
     * happens immediately, matching the old behaviour. Either way the swap is a single
     * {@link AtomicReference#set}, so no reader ever observes an empty or partially-refreshed map.
     */
    private void refreshCacheAfterCommit(Map<RolePermissionId, Boolean> refreshed) {
        Map<RolePermissionId, Boolean> snapshot = Map.copyOf(refreshed);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cacheRef.set(snapshot);
                }
            });
        } else {
            cacheRef.set(snapshot);
        }
    }

    private LocalDateTime maxUpdatedAt(List<RolePermission> rows) {
        return rows.stream()
                .map(RolePermission::getUpdatedAt)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    /**
     * Verifies every editable role has a row for every {@link Permission} and inserts the enum
     * default for any pair that's missing (e.g. after manual schema drift), logging what it healed.
     * {@code allows()}/{@code has()} fail closed for a missing row, so without this a deleted row
     * would silently deny a permission forever instead of just until the next boot — package-visible
     * (not private) so tests can also invoke it directly after deleting a row mid-run.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void selfHealMissingRows() {
        Set<RolePermissionId> existing = new HashSet<>();
        for (RolePermission row : repository.findAll()) {
            existing.add(row.getId());
        }

        LocalDateTime now = LocalDateTime.now();
        List<RolePermission> missingRows = new ArrayList<>();
        List<String> missingKeys = new ArrayList<>();
        for (Member.Role role : EDITABLE_ROLES) {
            for (Permission permission : Permission.values()) {
                RolePermissionId id = new RolePermissionId(role, permission);
                if (existing.contains(id)) {
                    continue;
                }
                RolePermission row = new RolePermission(id);
                row.setAllowed(permission.defaultRoles().contains(role));
                row.setUpdatedAt(now);
                missingRows.add(row);
                missingKeys.add(role.name() + ":" + permission.key());
            }
        }

        if (!missingRows.isEmpty()) {
            repository.saveAll(missingRows);
            log.warn("Self-healed {} missing role_permissions row(s) with enum defaults: {}",
                    missingRows.size(), missingKeys);
        }
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
