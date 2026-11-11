package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AskRequest(
        @NotBlank @Size(min = 5, max = 2000) String question,
        @Size(max = 254) String replyEmail,
        @Size(max = 60) String name,
        String honeypot,
        @NotBlank @Size(max = 200) String pagePath
) {
    public AskRequest {
        question = question == null ? null : question.trim();
    }
}
