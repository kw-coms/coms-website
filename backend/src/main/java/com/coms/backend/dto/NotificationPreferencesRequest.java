package com.coms.backend.dto;

import jakarta.validation.constraints.NotNull;

public record NotificationPreferencesRequest(
        @NotNull Boolean commentOnPost,
        @NotNull Boolean replyOnComment,
        @NotNull Boolean noticeCreated,
        @NotNull Boolean externalInvite,
        @NotNull Boolean communityPostRestored,
        @NotNull Boolean communityPostDeleted,
        @NotNull Boolean recruitApplication
) {}
