package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

public record NoticeAuthorUpdateRequest(
        @Size(max = 100) String name,
        @Size(max = 20) String studentId
) {
}
