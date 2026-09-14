package com.coms.backend.repository;

import com.coms.backend.domain.PendingSignup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;

public interface PendingSignupRepository extends JpaRepository<PendingSignup, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PendingSignup> findByStudentId(String studentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PendingSignup> findById(UUID id);

    default Optional<PendingSignup> findByStudentIdForUpdate(String studentId) {
        return findByStudentId(studentId);
    }

    default Optional<PendingSignup> findByIdForUpdate(UUID id) {
        return findById(id);
    }
}
