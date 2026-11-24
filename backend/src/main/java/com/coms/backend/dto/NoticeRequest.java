package com.coms.backend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NoticeRequest(
        @NotBlank @Size(max = 255) String title,
        @NotBlank String content,
        @Size(max = 255) String author,
        Boolean pinned,
        String category,
        Boolean publicVisible,
        @Schema(description = "Required when updating an existing notice.") Long version
) {
    public NoticeRequest(String title, String content, String author, Boolean pinned, String category) {
        this(title, content, author, pinned, category, null, null);
    }

    public NoticeRequest(String title, String content, String author, Boolean pinned, String category, Boolean publicVisible) {
        this(title, content, author, pinned, category, publicVisible, null);
    }
    public NoticeRequest {
        // Jackson 3 maps a missing/null value onto a primitive boolean as HTTP 500; default false.
        pinned = pinned != null && pinned;
    }
}
