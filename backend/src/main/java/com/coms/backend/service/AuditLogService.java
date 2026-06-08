package com.coms.backend.service;

import com.coms.backend.domain.AuditLog;
import com.coms.backend.dto.AuditLogResponse;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AuditLogService {
    private static final int MAX_DETAIL_LENGTH = 1000;

    private final AuditLogRepository auditLogRepository;
    private final MemberRepository memberRepository;

    public AuditLogService(AuditLogRepository auditLogRepository, MemberRepository memberRepository) {
        this.auditLogRepository = auditLogRepository;
        this.memberRepository = memberRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actorStudentId,
                       String action,
                       String targetType,
                       String targetId,
                       String detail,
                       String ipAddress) {
        try {
            AuditLog log = new AuditLog();
            log.setActorStudentId(blankToNull(actorStudentId));
            log.setActorName(resolveActorName(actorStudentId));
            log.setAction(action);
            log.setTargetType(targetType);
            log.setTargetId(blankToNull(targetId));
            log.setDetail(truncate(blankToNull(detail)));
            log.setIpAddress(blankToNull(ipAddress));
            auditLogRepository.save(log);
        } catch (Exception ignored) {
            // Audit logging must not block the user-facing action.
        }
    }

    @Transactional(readOnly = true)
    public List<AuditLogResponse> recent() {
        return auditLogRepository.findTop300ByOrderByCreatedAtDesc().stream()
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

    private String resolveActorName(String actorStudentId) {
        if (actorStudentId == null || actorStudentId.isBlank()) {
            return null;
        }
        return memberRepository.findByStudentId(actorStudentId)
                .map(member -> member.getName())
                .orElse(null);
    }

    private String truncate(String value) {
        if (value == null || value.length() <= MAX_DETAIL_LENGTH) {
            return value;
        }
        return value.substring(0, MAX_DETAIL_LENGTH);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
