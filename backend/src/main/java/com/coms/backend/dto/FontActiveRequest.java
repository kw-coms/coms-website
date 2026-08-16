package com.coms.backend.dto;

public record FontActiveRequest(Boolean active) {
    public FontActiveRequest {
        // Jackson 3 maps a missing/null value onto a primitive boolean as HTTP 500; default false.
        active = active != null && active;
    }
}
