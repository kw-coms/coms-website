package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CommunityReportResolveRequest(
        @NotBlank @Size(max = 16) String action,
        @Size(max = 500) String note
) {}
