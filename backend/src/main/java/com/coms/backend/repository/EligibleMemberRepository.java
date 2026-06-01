package com.coms.backend.repository;

import com.coms.backend.domain.EligibleMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EligibleMemberRepository extends JpaRepository<EligibleMember, Long> {
    Optional<EligibleMember> findByStudentId(String studentId);
    Optional<EligibleMember> findByNameAndPhone(String name, String phone);
}
