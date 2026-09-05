package com.coms.backend.repository;

import com.coms.backend.domain.RolePermission;
import com.coms.backend.domain.RolePermissionId;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface RolePermissionRepository extends JpaRepository<RolePermission, RolePermissionId> {

    /**
     * Row-locks the whole table for the duration of the caller's transaction. Used by
     * {@code PermissionService.replace()} so its optimistic-concurrency check (compare against
     * {@code expectedUpdatedAt}) and the subsequent write are serialized against any other
     * concurrent replace() — otherwise two admins could both read the same "current" matrix, both
     * pass the check, and the second write would silently clobber the first.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RolePermission r")
    List<RolePermission> findAllForUpdate();
}
