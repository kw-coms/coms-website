package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ArchiveFileResponse(
        Long id,
        String title,
        String description,
        String originalName,
        String mimeType,
        Long fileSize,
        String uploadedBy,
        String uploaderName,
        String category,
        String visibility,
        List<String> selectedStudentIds,
        Long studyGroupId,
        Long studySessionId,
        long viewCount,
        long upvotes,
        int myVote,
        LocalDateTime uploadedAt,
        String contentVersion,
        List<ArchiveAttachmentResponse> attachments
) {
}
