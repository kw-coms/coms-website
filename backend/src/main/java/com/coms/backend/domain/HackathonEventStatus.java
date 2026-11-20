package com.coms.backend.domain;

import java.time.LocalDateTime;

/** 행사 진행 상태. 개발 기간은 서울 벽시계 시각이며, now도 서울 시각으로 넘긴다. */
public enum HackathonEventStatus {
    UPCOMING, IN_PROGRESS, REVIEWING, DONE;

    public static HackathonEventStatus of(HackathonEvent event, LocalDateTime now) {
        LocalDateTime start = event.getStartsAt();
        LocalDateTime end = event.getEndsAt();
        if (start != null && end != null) {
            if (now.isBefore(start)) return UPCOMING;
            if (!now.isAfter(end)) return IN_PROGRESS;
        }
        return event.isOpen() ? REVIEWING : DONE;
    }
}
