package com.coms.backend.dto;

import com.coms.backend.domain.RecruitApplication;

import java.time.LocalDateTime;

/**
 * Public-facing application status. Intentionally exposes only the applicant's own
 * status, a friendly Korean label, and the submission timestamp — never admin notes,
 * contact details, or any other applicant's data.
 */
public record RecruitApplicationStatusResponse(
        String status,
        String statusLabel,
        LocalDateTime submittedAt
) {
    public static RecruitApplicationStatusResponse from(RecruitApplication application, String statusLabel) {
        return new RecruitApplicationStatusResponse(
                application.getStatus().name(),
                statusLabel,
                application.getSubmittedAt()
        );
    }

    /**
     * A decided application. Its row no longer exists (the decision log is the record), so there
     * is no submission time to report.
     */
    public static RecruitApplicationStatusResponse decided(RecruitApplication.Status status, String statusLabel) {
        return new RecruitApplicationStatusResponse(status.name(), statusLabel, null);
    }
}
