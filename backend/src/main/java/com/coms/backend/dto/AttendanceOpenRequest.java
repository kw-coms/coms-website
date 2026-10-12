package com.coms.backend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Opens an attendance check: what it is for and how many minutes members have to check in. */
public record AttendanceOpenRequest(
        @NotBlank @Size(max = 100) String title,
        @NotNull @Min(5) @Max(180) Integer minutes
) {
}
