package com.coms.backend.service;

import com.coms.backend.domain.AuditLog;
import com.coms.backend.dto.AuditLogResponse;
import com.coms.backend.repository.AuditLogRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.FlushModeType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

@Service
public class AuditLogService {
    private static final Logger log = LoggerFactory.getLogger(AuditLogService.class);

    private static final int MAX_DETAIL_LENGTH = 1000;
    // Column widths of audit_logs (V33). Every value is cut to fit so the insert can never be
    // the reason the audited action itself fails.
    private static final int MAX_ACTOR_STUDENT_ID_LENGTH = 50;
    private static final int MAX_ACTOR_NAME_LENGTH = 100;
    private static final int MAX_ACTION_LENGTH = 80;
    private static final int MAX_TARGET_TYPE_LENGTH = 80;
    private static final int MAX_TARGET_ID_LENGTH = 120;
    private static final int MAX_IP_ADDRESS_LENGTH = 80;
    private static final int DEFAULT_RECENT_LIMIT = 1000;
    private static final int MAX_RECENT_LIMIT = 2000;

    private final AuditLogRepository auditLogRepository;
    private final EntityManager entityManager;
    private final TransactionTemplate ownTransaction;

    public AuditLogService(AuditLogRepository auditLogRepository,
                           EntityManager entityManager,
                           PlatformTransactionManager transactionManager) {
        this.auditLogRepository = auditLogRepository;
        this.entityManager = entityManager;
        this.ownTransaction = new TransactionTemplate(transactionManager);
        this.ownTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Writes one audit row. Never throws: audit logging must not block the user-facing action.
     *
     * <p>When the caller is already inside a writable transaction the row is written in <em>that</em>
     * transaction, on the connection the caller already holds. It used to open a nested
     * {@code REQUIRES_NEW} transaction instead, which needs a second pooled connection while the
     * first is still held — so as many concurrent requests as the pool has connections (ten by
     * default) each sat on one connection waiting for another, and every database call on the
     * site stalled until the acquisition timeout. Logging in records an audit row, so this was
     * reachable without an account.
     *
     * <p>Consequently the row commits or rolls back together with the action it describes. A
     * caller that must keep its audit row on a rejected request (the login path) commits its
     * transaction with {@code noRollbackFor}.
     */
    public void record(String actorStudentId,
                       String action,
                       String targetType,
                       String targetId,
                       String detail,
                       String ipAddress) {
        try {
            if (TransactionSynchronizationManager.isActualTransactionActive()
                    && !TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
                persist(actorStudentId, action, targetType, targetId, detail, ipAddress);
                return;
            }
            // No transaction to join (controllers call this after the service has returned), or a
            // read-only one that cannot take the insert.
            ownTransaction.executeWithoutResult(status ->
                    persist(actorStudentId, action, targetType, targetId, detail, ipAddress));
        } catch (RuntimeException ex) {
            log.warn("Audit log write failed for action {}", action, ex);
        }
    }

    private void persist(String actorStudentId,
                         String action,
                         String targetType,
                         String targetId,
                         String detail,
                         String ipAddress) {
        AuditLog entry = new AuditLog();
        entry.setActorStudentId(truncate(blankToNull(actorStudentId), MAX_ACTOR_STUDENT_ID_LENGTH));
        entry.setActorName(truncate(resolveActorName(actorStudentId), MAX_ACTOR_NAME_LENGTH));
        entry.setAction(truncate(requiredLabel(action), MAX_ACTION_LENGTH));
        entry.setTargetType(truncate(requiredLabel(targetType), MAX_TARGET_TYPE_LENGTH));
        entry.setTargetId(truncate(blankToNull(targetId), MAX_TARGET_ID_LENGTH));
        entry.setDetail(truncate(blankToNull(detail), MAX_DETAIL_LENGTH));
        entry.setIpAddress(truncate(blankToNull(ipAddress), MAX_IP_ADDRESS_LENGTH));
        auditLogRepository.save(entry);
    }

    @Transactional(readOnly = true)
    public List<AuditLogResponse> recent() {
        return recent(DEFAULT_RECENT_LIMIT);
    }

    @Transactional(readOnly = true)
    public List<AuditLogResponse> recent(int limit) {
        return auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, boundedLimit(limit))).stream()
                .map(log -> new AuditLogResponse(
                        log.getId(),
                        log.getActorStudentId(),
                        log.getActorName(),
                        log.getAction(),
                        log.getTargetType(),
                        log.getTargetId(),
                        log.getDetail(),
                        log.getIpAddress(),
                        log.getCreatedAt()
                ))
                .toList();
    }

    private int boundedLimit(int limit) {
        if (limit < 1) {
            return 1;
        }
        return Math.min(limit, MAX_RECENT_LIMIT);
    }

    /**
     * Looks the actor's name up without flushing the caller's pending changes. This now runs
     * inside the caller's persistence context, and a default (AUTO) query would flush it first:
     * a constraint violation from the caller's own unflushed work would then surface here, be
     * swallowed by {@link #record}, and come back later as an opaque rollback at commit.
     */
    private String resolveActorName(String actorStudentId) {
        if (actorStudentId == null || actorStudentId.isBlank()) {
            return null;
        }
        return entityManager
                .createQuery("select m.name from Member m where m.studentId = :studentId", String.class)
                .setParameter("studentId", actorStudentId)
                .setFlushMode(FlushModeType.COMMIT)
                .setMaxResults(1)
                .getResultStream()
                .findFirst()
                .orElse(null);
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /** action / target_type are NOT NULL; a missing label must not fail the insert. */
    private static String requiredLabel(String value) {
        return value == null || value.isBlank() ? "UNKNOWN" : value;
    }
}
