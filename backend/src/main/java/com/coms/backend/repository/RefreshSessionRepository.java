package com.coms.backend.repository;

import com.coms.backend.domain.RefreshSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface RefreshSessionRepository extends JpaRepository<RefreshSession, Long> {

    Optional<RefreshSession> findByJti(String jti);

    /**
     * Atomic claim of a live token. The {@code revoked_at IS NULL} guard is what makes two parallel
     * refreshes with the same jti safe: exactly one UPDATE reports a changed row, the other gets 0.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE RefreshSession s SET s.revokedAt = :now, s.replacedBy = :replacedBy "
            + "WHERE s.jti = :jti AND s.revokedAt IS NULL")
    int claimForRotation(@Param("jti") String jti,
                         @Param("replacedBy") String replacedBy,
                         @Param("now") LocalDateTime now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE RefreshSession s SET s.revokedAt = :now WHERE s.family = :family AND s.revokedAt IS NULL")
    int revokeFamily(@Param("family") String family, @Param("now") LocalDateTime now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE RefreshSession s SET s.revokedAt = :now WHERE s.studentId = :studentId AND s.revokedAt IS NULL")
    int revokeAllForStudent(@Param("studentId") String studentId, @Param("now") LocalDateTime now);

    void deleteByStudentId(String studentId);

    /** Retention purge: expired or revoked long enough ago that nothing can reference them any more. */
    @Modifying
    @Query("DELETE FROM RefreshSession s WHERE s.expiresAt < :before OR s.revokedAt < :before")
    int deleteStaleBefore(@Param("before") LocalDateTime before);
}
