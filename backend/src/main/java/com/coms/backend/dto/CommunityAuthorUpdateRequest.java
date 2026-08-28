package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

/**
 * 회장 전용 작성자 변경. Exactly one of the two:
 * - studentId: reassign the post to that member (display name follows them)
 * - name: override only the displayed author name, ownership unchanged
 */
public record CommunityAuthorUpdateRequest(
        @Size(max = 20) String studentId,
        @Size(max = 60) String name
) {
}
