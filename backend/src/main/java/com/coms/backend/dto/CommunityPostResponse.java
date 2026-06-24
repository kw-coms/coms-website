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
        String anonymousName,
        boolean authorAdmin,
        String authorTier,
        String authorTierLabel,
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
        long commentCount,
        int myVote,
        List<PollResult> pollResults,
        boolean conceptPost,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean edited,
        boolean editable,
        boolean pinned
) {
    public record MediaInfo(Long id, String url, String originalName) {}
    public record PollResult(String pollId, List<Long> optionCounts, Integer myOption, LocalDateTime closesAt, LocalDateTime closedAt, boolean closed) {}
}
