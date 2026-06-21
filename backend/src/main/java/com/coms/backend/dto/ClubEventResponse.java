package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ClubEventResponse(
        Long id,
        String title,
        String description,
        LocalDateTime startsAt,
        LocalDateTime endsAt,
        boolean votingOpen,
        long totalVotes,
        Long myEntryId,
        int entryCount,
        List<Entry> entries,
        String createdByName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record Entry(
            Long id,
            String title,
            String authorName,
            String description,
            String downloadUrl,
            String originalName,
            String mimeType,
            long fileSize,
            List<EntryFile> files,
            long voteCount,
            boolean myVote,
            int rank,
            LocalDateTime createdAt
    ) {}

    public record EntryFile(
            Long id,
            String downloadUrl,
            String originalName,
            String mimeType,
            long fileSize
    ) {}
}
