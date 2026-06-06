package com.coms.backend.repository;

import com.coms.backend.domain.BannedStudent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BannedStudentRepository extends JpaRepository<BannedStudent, Long> {
    boolean existsByStudentId(String studentId);
    Optional<BannedStudent> findByStudentId(String studentId);
    List<BannedStudent> findAllByOrderByBannedAtDesc();
    void deleteByExpiresAtLessThanEqual(java.time.LocalDateTime expiresAt);
}
