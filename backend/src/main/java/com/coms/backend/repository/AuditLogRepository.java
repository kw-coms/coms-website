package com.coms.backend.repository;

import com.coms.backend.domain.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findTop300ByOrderByCreatedAtDesc();
}
