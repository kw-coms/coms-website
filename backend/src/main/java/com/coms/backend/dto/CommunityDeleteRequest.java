package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

public record CommunityDeleteRequest(
        @Size(max = 300) String reason
) {}
