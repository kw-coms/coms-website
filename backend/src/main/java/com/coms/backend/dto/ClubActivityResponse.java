package com.coms.backend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
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
        @Schema(types = {"string", "null"}, format = "date") LocalDate eventDate,
        @Schema(types = {"string", "null"}, format = "date") LocalDate endDate,
        String startTime,
        String endTime,
        String colorHex,
        String imageUrl,
        String imageOriginalName,
        List<MediaInfo> imageInfos,
        List<MediaInfo> fileInfos,
        String createdByName,
        long viewCount,
        long upvotes,
        int myVote,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        @Schema(types = {"string", "null"}) String timelineStatus,
        String resolvedStatus,
        boolean showOnTimeline,
        String timelineTerm,
        String dateLabel,
        String memberFacts
) {
    public record MediaInfo(Long id, String url, String originalName) {}

    public ClubActivityResponse(Long id, String kind, String category, String categoryName, String title,
                                String description, LocalDate eventDate, LocalDate endDate, String startTime,
                                String endTime, String colorHex, String imageUrl, String imageOriginalName,
                                List<MediaInfo> imageInfos, List<MediaInfo> fileInfos, String createdByName,
                                long viewCount, long upvotes, int myVote, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this(id, kind, category, categoryName, title, description, eventDate, endDate, startTime,
                endTime, colorHex, imageUrl, imageOriginalName, imageInfos, fileInfos, createdByName,
                viewCount, upvotes, myVote, createdAt, updatedAt, null, null, false, null, null, null);
    }
}
