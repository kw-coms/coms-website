package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A member's check-in: the code shown by whoever opened the attendance check. */
public record AttendanceCheckInRequest(
        @NotBlank @Size(max = 16) String code
) {
}
