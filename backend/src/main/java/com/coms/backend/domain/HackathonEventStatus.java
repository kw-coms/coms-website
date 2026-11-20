package com.coms.backend.domain;

import java.time.LocalDateTime;

/** 행사 진행 상태. 개발 기간은 서울 벽시계 시각이며, now도 서울 시각으로 넘긴다. */
public enum HackathonEventStatus {
    UPCOMING, IN_PROGRESS, REVIEWING, DONE;

    /** everReviewed: 평가가 한 번이라도 접수된 행사. 날짜 없는 행사는 한 번도 열린 적 없으면 시작 예정으로 본다. */
    public static HackathonEventStatus of(HackathonEvent event, LocalDateTime now, boolean everReviewed) {
        LocalDateTime start = event.getStartsAt();
        LocalDateTime end = event.getEndsAt();
        if (start != null && end != null) {
            if (now.isBefore(start)) return UPCOMING;
            if (!now.isAfter(end)) return IN_PROGRESS;
        }
        if (event.isOpen()) return REVIEWING;
        return start == null && !everReviewed ? UPCOMING : DONE;
    }
}
