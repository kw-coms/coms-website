package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

public record RecurringScheduleExceptionRequest(
        Boolean canceled,
        // ISO local time strings (e.g. "HH:mm"); parsed/validated in the service. Capped to
        // bound payload size — nulled out when the occurrence is canceled.
        @Size(max = 20) String startTime,
        @Size(max = 20) String endTime
) {
    public RecurringScheduleExceptionRequest {
        // Jackson 3 maps a missing/null value onto a primitive boolean as HTTP 500; default false.
        canceled = canceled != null && canceled;
    }
}
