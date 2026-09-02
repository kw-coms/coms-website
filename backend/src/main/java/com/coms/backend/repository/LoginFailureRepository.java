package com.coms.backend.repository;

import com.coms.backend.domain.LoginFailure;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface LoginFailureRepository extends JpaRepository<LoginFailure, Long> {

    long countByStudentIdAndAttemptedAtAfter(String studentId, LocalDateTime since);

    long countByIpAndAttemptedAtAfter(String ip, LocalDateTime since);

    void deleteByStudentId(String studentId);

    @Modifying
    @Query("DELETE FROM LoginFailure f WHERE f.attemptedAt < :before")
    void deleteOlderThan(@Param("before") LocalDateTime before);
}
