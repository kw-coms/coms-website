package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record DeletedCommunityPostResponse(
        Long id,
        Long originalPostId,
        String title,
        String content,
        String authorStudentId,
        String authorName,
        String category,
        long viewCount,
        LocalDateTime originalCreatedAt,
        LocalDateTime originalUpdatedAt,
        String deletedByStudentId,
        String deletedByName,
        String deletedByRole,
        String deletionReason,
        LocalDateTime deletedAt,
        List<ImageInfo> imageInfos,
        List<MediaInfo> videoInfos,
        List<MediaInfo> fileInfos,
        long commentCount,
        List<CommentInfo> commentInfos,
        Long restoredPostId,
        String restoredByStudentId,
        String restoredByName,
        LocalDateTime restoredAt,
        String latestAppealStatus,
        String latestAppealRequesterStudentId,
        String latestAppealRequesterName,
        String latestAppealMessage,
        LocalDateTime latestAppealCreatedAt,
        String latestAppealResolutionNote,
        LocalDateTime latestAppealResolvedAt
) {
    public record ImageInfo(Long id, Long originalImageId, String kind, String url, String originalName) {}
    public record MediaInfo(Long id, Long originalMediaId, String kind, String url, String originalName) {}
    public record CommentInfo(
            Long originalCommentId,
            Long originalParentCommentId,
            String authorStudentId,
            String authorName,
            String content,
            LocalDateTime createdAt,
            boolean edited
    ) {}
}
