package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record GenerationUpdateRequest(
        @NotBlank @Pattern(regexp = "\\d{1,3}", message = "기수는 숫자여야 합니다.") String generation
) {
}
