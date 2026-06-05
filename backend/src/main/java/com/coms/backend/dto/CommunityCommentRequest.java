package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CommunityCommentRequest(
        @NotBlank @Size(max = 1000) String content,
        Long parentCommentId
) {}
