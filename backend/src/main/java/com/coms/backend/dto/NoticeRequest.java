package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NoticeRequest(
        @NotBlank @Size(max = 255) String title,
        @NotBlank String content,
        @NotBlank @Size(max = 255) String author,
        boolean pinned
) {
}
