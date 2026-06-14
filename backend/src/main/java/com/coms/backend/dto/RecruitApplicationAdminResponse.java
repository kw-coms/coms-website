package com.coms.backend.dto;

import com.coms.backend.domain.RecruitApplication;

import java.time.LocalDateTime;

public record RecruitApplicationAdminResponse(
        Long id,
        String name,
        String studentId,
        String department,
        String grade,
        String phone,
        String email,
        String interests,
        String motive,
        String experience,
        String expectation,
        String status,
        String adminNote,
        String clientIp,
        LocalDateTime submittedAt,
        LocalDateTime updatedAt
) {
    public static RecruitApplicationAdminResponse from(RecruitApplication application) {
        return new RecruitApplicationAdminResponse(
                application.getId(),
                application.getName(),
                application.getStudentId(),
                application.getDepartment(),
                application.getGrade(),
                application.getPhone(),
                application.getEmail(),
                application.getInterests(),
                application.getMotive(),
                application.getExperience(),
                application.getExpectation(),
                application.getStatus().name(),
                application.getAdminNote(),
                application.getClientIp(),
                application.getSubmittedAt(),
                application.getUpdatedAt()
        );
    }
}
