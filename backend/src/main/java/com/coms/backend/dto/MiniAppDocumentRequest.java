package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record MiniAppDocumentRequest(
        @NotBlank @Size(max = 160) String title,
        @Size(max = 500) String description,
        Boolean shared,
        @NotNull Map<String, Object> payload
) {
}
