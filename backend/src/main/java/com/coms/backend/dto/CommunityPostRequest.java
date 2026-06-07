package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CommunityPostRequest(
        @NotBlank @Size(max = 120) String title,
        @NotBlank @Size(max = 50000) String content,
        String category,
        boolean removeImage
) {}
