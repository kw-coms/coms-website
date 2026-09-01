package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NoticeAuthorUpdateRequest(
        @NotBlank @Size(max = 100) String name
) {
}
