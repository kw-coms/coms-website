package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RecruitApplicationStatusUpdateRequest(
        @NotBlank @Size(max = 20) String status,
        @Size(max = 1000) String adminNote
) {
}
