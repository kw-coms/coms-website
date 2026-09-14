package com.coms.backend.repository;

import com.coms.backend.domain.PendingSignup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;

public interface PendingSignupRepository extends JpaRepository<PendingSignup, UUID> {
    Optional<PendingSignup> findByStudentId(String studentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select pendingSignup from PendingSignup pendingSignup where pendingSignup.studentId = :studentId")
    Optional<PendingSignup> findByStudentIdForUpdate(@Param("studentId") String studentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select pendingSignup from PendingSignup pendingSignup where pendingSignup.id = :id")
    Optional<PendingSignup> findByIdForUpdate(@Param("id") UUID id);
}
