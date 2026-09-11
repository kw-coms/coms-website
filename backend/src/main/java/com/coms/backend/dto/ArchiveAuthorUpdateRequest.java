package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

public record ArchiveAuthorUpdateRequest(
        @Size(max = 60) String uploaderName,
        @Size(max = 20) String studentId
) {
}
