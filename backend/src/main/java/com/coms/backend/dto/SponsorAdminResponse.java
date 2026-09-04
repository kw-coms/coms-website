package com.coms.backend.dto;

import java.time.LocalDate;

/** 회장 전용 목록 행: 공개 필드 + 금액 메모 + 숨김/만료 상태. */
public record SponsorAdminResponse(
        Long id,
        String name,
        Long tierId,
        String tierName,
        Long logoImageId,
        String logoUrl,
        String linkUrl,
        String description,
        String amountNote,
        LocalDate sinceDate,
        LocalDate untilDate,
        boolean anonymous,
        boolean visible,
        boolean expired,
        int sortOrder
) {
}
