package com.coms.backend.dto;

import com.coms.backend.domain.RecruitPromotionLog;

import java.time.LocalDateTime;

public record RecruitPromotionLogResponse(
        Long id,
        Long applicationId,
        String name,
        String studentId,
        String department,
        String phone,
        String email,
        String generation,
        String promotedBy,
        String decision,
        String adminNote,
        LocalDateTime promotedAt
) {
    public static RecruitPromotionLogResponse from(RecruitPromotionLog log) {
        return new RecruitPromotionLogResponse(
                log.getId(),
                log.getApplicationId(),
                log.getName(),
                log.getStudentId(),
                log.getDepartment(),
                log.getPhone(),
                log.getEmail(),
                log.getGeneration(),
                log.getPromotedBy(),
                log.getDecision().name(),
                log.getAdminNote(),
                log.getPromotedAt()
        );
    }
}
