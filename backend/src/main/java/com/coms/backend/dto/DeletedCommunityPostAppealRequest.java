package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DeletedCommunityPostAppealRequest(
        @NotBlank(message = "복원 요청 사유를 입력해주세요.")
        @Size(max = 500, message = "복원 요청 사유는 500자 이하로 입력해주세요.")
        String message
) {}
