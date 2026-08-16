package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NoticeRequest(
        @NotBlank @Size(max = 255) String title,
        @NotBlank String content,
        @Size(max = 255) String author,
        Boolean pinned,
        String category
) {
    public NoticeRequest {
        // Jackson 3 maps a missing/null value onto a primitive boolean as HTTP 500; default false.
        pinned = pinned != null && pinned;
    }
}
