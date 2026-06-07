package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record CommunityPostResponse(
        Long id,
        String title,
        String content,
        String authorStudentId,
        String authorName,
        String authorDisplayName,
        boolean authorAdmin,
        String category,
        String imageUrl,
        String imageOriginalName,
        List<String> imageUrls,
        List<MediaInfo> imageInfos,
        List<MediaInfo> videoInfos,
        List<MediaInfo> fileInfos,
        long viewCount,
        long upvotes,
        long downvotes,
        int myVote,
        boolean conceptPost,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean edited,
        boolean editable
) {
    public record MediaInfo(Long id, String url, String originalName) {}
}
