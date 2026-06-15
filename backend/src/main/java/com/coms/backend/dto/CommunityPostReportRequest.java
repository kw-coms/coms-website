package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CommunityPostReportRequest(
        @NotBlank @Size(max = 64) String reason,
        @Size(max = 500) String detail
) {}
