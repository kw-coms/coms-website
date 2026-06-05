package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @Size(max = 20) String phone,
        @Size(max = 2000) String aspiration,
        @Size(max = 500) String interests,
        Long selectedFontId
) {}
