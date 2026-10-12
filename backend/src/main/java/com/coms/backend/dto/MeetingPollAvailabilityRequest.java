package com.coms.backend.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * A member's answer: one character per slot, day after day, '1' where the member is free.
 * The length has to match the poll exactly; the service checks that.
 */
public record MeetingPollAvailabilityRequest(
        @NotNull
        @Size(max = 672)
        @Pattern(regexp = "^[01]*$", message = "가능 시간은 0과 1로만 이루어져야 합니다.")
        String slots
) {
}
