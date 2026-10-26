package com.coms.backend.repository;

import com.coms.backend.domain.AuditLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** Retention: the action stays on record, the client address does not. */
    @Modifying
    @Query("UPDATE AuditLog l SET l.ipAddress = NULL WHERE l.ipAddress IS NOT NULL AND l.createdAt < :before")
    int clearIpAddressesBefore(@Param("before") LocalDateTime before);
}
