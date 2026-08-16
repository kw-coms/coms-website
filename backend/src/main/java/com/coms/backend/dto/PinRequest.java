package com.coms.backend.dto;

public record PinRequest(
        Boolean pinned
) {
    public PinRequest {
        // Jackson 3 maps a missing/null value onto a primitive boolean as HTTP 500; default false.
        pinned = pinned != null && pinned;
    }
}
