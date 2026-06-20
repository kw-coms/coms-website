package com.coms.backend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record ClubActivityResponse(
        Long id,
        String kind,
        String category,
        String categoryName,
        String title,
        String description,
        LocalDate eventDate,
        LocalDate endDate,
        String startTime,
        String endTime,
        String imageUrl,
        String imageOriginalName,
        List<MediaInfo> imageInfos,
        List<MediaInfo> fileInfos,
        String createdByName,
        long viewCount,
        long upvotes,
        int myVote,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record MediaInfo(Long id, String url, String originalName) {}
}
