package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * 후원자 생성/수정 입력. {@code amountNote} is 회장 전용 and only ever travels on this
 * admin request and the admin response — never on a public one.
 */
public record SponsorRequest(
        @NotBlank @Size(min = 1, max = 80) String name,
        Long tierId,
        Long logoImageId,
        @Size(max = 500) String linkUrl,
        String description,
        @Size(max = 120) String amountNote,
        LocalDate sinceDate,
        LocalDate untilDate,
        Boolean anonymous,
        Boolean visible,
        Integer sortOrder
) {
}
