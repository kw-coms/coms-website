package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ArchiveAuthorUpdateRequest(
        @NotBlank @Size(max = 60) String uploaderName
) {
}
