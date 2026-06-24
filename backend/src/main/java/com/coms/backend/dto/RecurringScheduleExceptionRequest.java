package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

public record RecurringScheduleExceptionRequest(
        boolean canceled,
        // ISO local time strings (e.g. "HH:mm"); parsed/validated in the service. Capped to
        // bound payload size — nulled out when the occurrence is canceled.
        @Size(max = 20) String startTime,
        @Size(max = 20) String endTime
) {
}
