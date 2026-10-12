package com.coms.backend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/**
 * A new gathering. {@code capacity}, {@code noteLabel} and {@code closesAt} are optional: no
 * limit, nothing asked of those who sign up, open until closed by hand. The closing time is
 * checked further in the service (in the future, within a year).
 */
public record GatheringRequest(
        @NotBlank @Size(max = 100) String title,
        @Size(max = 1000) String description,
        @Min(1) @Max(500) Integer capacity,
        @Size(max = 40) String noteLabel,
        LocalDateTime closesAt
) {
}
