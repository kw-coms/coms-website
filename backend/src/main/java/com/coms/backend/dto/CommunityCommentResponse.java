package com.coms.backend.dto;

import java.time.LocalDateTime;

public record CommunityCommentResponse(
        Long id,
        Long postId,
        Long parentCommentId,
        int depth,
        String authorName,
        String authorTier,
        String authorTierLabel,
        String content,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean edited,
        boolean deletable,
        /**
         * Narrower than {@code deletable}: moderators may remove a comment, but only its author
         * and 회장 may rewrite it. Clients that showed 수정 on {@code deletable} sent moderators
         * into a 403.
         */
        boolean editable
) {}
