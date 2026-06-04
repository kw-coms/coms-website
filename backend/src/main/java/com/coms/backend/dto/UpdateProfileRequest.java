package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @Size(max = 20, message = "전화번호는 20자 이하여야 합니다.") String phone,
        @Size(max = 2000, message = "포부는 2000자 이하여야 합니다.") String aspiration,
        @Size(max = 500, message = "관심 분야는 500자 이하여야 합니다.") String interests
) {}
