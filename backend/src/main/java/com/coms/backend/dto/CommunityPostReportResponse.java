package com.coms.backend.dto;

import com.coms.backend.domain.CommunityPostReport;

import java.time.LocalDateTime;

public record CommunityPostReportResponse(
        Long id,
        Long postId,
        String postTitle,
        String postAuthorStudentId,
        String postAuthorName,
        String reporterStudentId,
        String reason,
        String detail,
        String status,
        String resolvedByStudentId,
        String resolutionNote,
        LocalDateTime createdAt,
        LocalDateTime resolvedAt
) {
    public static CommunityPostReportResponse from(CommunityPostReport report) {
        return from(report, null);
    }

    /**
     * Reporter-facing projection: the report is stored with the post author's real identity for
     * admin moderation, but the member who filed it must never receive it — that would deanonymize
     * anonymous-board posters. Only the ADMIN report list/resolve paths return the full identity.
     */
    public static CommunityPostReportResponse forReporter(CommunityPostReport report) {
        return new CommunityPostReportResponse(
                report.getId(),
                report.getPostId(),
                report.getPostTitle(),
                null,
                null,
                report.getReporterStudentId(),
                report.getReason(),
                report.getDetail(),
                report.getStatus().name(),
                report.getResolvedByStudentId(),
                report.getResolutionNote(),
                report.getCreatedAt(),
                report.getResolvedAt()
        );
    }

    public static CommunityPostReportResponse from(CommunityPostReport report, String postTitle) {
        return from(report, report.getPostId(), postTitle);
    }

    public static CommunityPostReportResponse from(CommunityPostReport report, Long postId, String postTitle) {
        return new CommunityPostReportResponse(
                report.getId(),
                postId,
                postTitle == null || postTitle.isBlank() ? report.getPostTitle() : postTitle,
                report.getPostAuthorStudentId(),
                report.getPostAuthorName(),
                report.getReporterStudentId(),
                report.getReason(),
                report.getDetail(),
                report.getStatus().name(),
                report.getResolvedByStudentId(),
                report.getResolutionNote(),
                report.getCreatedAt(),
                report.getResolvedAt()
        );
    }
}
