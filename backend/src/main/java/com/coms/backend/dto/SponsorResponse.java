package com.coms.backend.dto;

import java.time.LocalDate;

/**
 * Public shape of a sponsor. Deliberately has NO {@code amountNote} field: the 금액 메모
 * is 회장 전용 bookkeeping, and a record with no such component cannot leak it by accident.
 * Anonymous sponsors arrive here already reduced to "익명 후원자" with no logo and no link.
 */
public record SponsorResponse(
        Long id,
        String name,
        Long tierId,
        String logoUrl,
        String linkUrl,
        String description,
        LocalDate sinceDate,
        LocalDate untilDate,
        boolean anonymous
) {
}
