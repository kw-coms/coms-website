package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RecruitApplicationStatusLookupRequest(
        @NotBlank @Size(max = 30) String name,
        @NotBlank @Pattern(regexp = "\\d{10}") String studentId
) {
}
