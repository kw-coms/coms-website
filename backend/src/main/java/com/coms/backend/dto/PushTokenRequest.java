package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PushTokenRequest(
        @NotBlank @Size(max = 1024) String token,
        @Size(max = 64) String platform,
        @Size(max = 128) String deviceId
) {}
