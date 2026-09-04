package com.coms.backend.repository;

import com.coms.backend.domain.RolePermission;
import com.coms.backend.domain.RolePermissionId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RolePermissionRepository extends JpaRepository<RolePermission, RolePermissionId> {
}
