package com.coms.backend.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static com.coms.backend.domain.HackathonEventStatus.*;
import static org.assertj.core.api.Assertions.assertThat;

class HackathonEventStatusTest {
    private static final LocalDateTime START = LocalDateTime.of(2026, 11, 8, 18, 0);
    private static final LocalDateTime END = LocalDateTime.of(2026, 11, 15, 4, 0);

    private static HackathonEvent event(LocalDateTime start, LocalDateTime end, boolean open) {
        HackathonEvent event = new HackathonEvent();
        event.setStartsAt(start);
        event.setEndsAt(end);
        event.setOpen(open);
        return event;
    }

    @Test
    void boundariesAreInclusiveForTheDevelopmentPeriod() {
        HackathonEvent open = event(START, END, true);
        assertThat(HackathonEventStatus.of(open, START.minusSeconds(1), false)).isEqualTo(UPCOMING);
        assertThat(HackathonEventStatus.of(open, START, false)).isEqualTo(IN_PROGRESS);
        assertThat(HackathonEventStatus.of(open, END, false)).isEqualTo(IN_PROGRESS);
        assertThat(HackathonEventStatus.of(open, END.plusSeconds(1), false)).isEqualTo(REVIEWING);
    }

    @Test
    void afterThePeriodTheOpenFlagDecidesReviewingOrDone() {
        assertThat(HackathonEventStatus.of(event(START, END, true), END.plusDays(30), false)).isEqualTo(REVIEWING);
        assertThat(HackathonEventStatus.of(event(START, END, false), END.plusSeconds(1), false)).isEqualTo(DONE);
        assertThat(HackathonEventStatus.of(event(START, END, false), START.minusDays(1), false)).isEqualTo(UPCOMING);
        assertThat(HackathonEventStatus.of(event(START, END, false), START, false)).isEqualTo(IN_PROGRESS);
    }

    @Test
    void eventsWithoutDatesAreUpcomingUntilTheyHaveBeenOpened() {
        assertThat(HackathonEventStatus.of(event(null, null, true), START, false)).isEqualTo(REVIEWING);
        assertThat(HackathonEventStatus.of(event(null, null, false), START, false)).isEqualTo(UPCOMING);
        assertThat(HackathonEventStatus.of(event(null, null, false), START, true)).isEqualTo(DONE);
    }
}
