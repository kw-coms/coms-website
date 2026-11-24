package com.coms.backend.service;

import com.coms.backend.domain.ClubActivity;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

/** The sole automatic timeline status rule, evaluated in the club's local time. */
public final class ClubActivityTimelineStatus {
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private ClubActivityTimelineStatus() {}

    public static String resolve(ClubActivity activity) {
        return resolve(activity.getTimelineStatus(), activity.getEventDate(), activity.getEndDate(),
                activity.getStartTime(), activity.getEndTime(), LocalDateTime.now(KST));
    }

    public static String resolve(String stored, LocalDate startDate, LocalDate endDate,
                                 LocalTime startTime, LocalTime endTime, LocalDateTime now) {
        if (stored != null) return stored;
        if (startDate == null) return "PLANNED";
        LocalDateTime start = startDate.atTime(startTime == null ? LocalTime.MIN : startTime);
        LocalDateTime end = (endDate == null ? startDate : endDate)
                .atTime(endTime == null ? LocalTime.MAX : endTime);
        if (now.isBefore(start)) return "CONFIRMED";
        if (now.isAfter(end)) return "DONE";
        return "LIVE";
    }

    public static String term(LocalDate date) {
        if (date == null) return null;
        int month = date.getMonthValue();
        int year = date.getYear();
        if (month <= 2) return (year - 1) + " 겨울방학";
        if (month <= 6) return year + " 1학기";
        if (month <= 8) return year + " 여름방학";
        return year + " 2학기";
    }
}
