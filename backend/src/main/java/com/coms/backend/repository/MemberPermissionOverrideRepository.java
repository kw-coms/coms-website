package com.coms.backend.repository;

import com.coms.backend.domain.MemberPermissionOverride;
import com.coms.backend.domain.MemberPermissionOverrideId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MemberPermissionOverrideRepository extends JpaRepository<MemberPermissionOverride, MemberPermissionOverrideId> {
    List<MemberPermissionOverride> findByIdStudentId(String studentId);
}
