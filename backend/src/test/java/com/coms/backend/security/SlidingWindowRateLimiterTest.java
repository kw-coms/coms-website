package com.coms.backend.security;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SlidingWindowRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-11T00:00:00Z"));

    @Test
    void allowsUpToTheLimitThenRefusesUntilTheWindowSlides() {
        SlidingWindowRateLimiter limiter = new SlidingWindowRateLimiter(3, Duration.ofMinutes(10), clock);

        assertThat(limiter.tryAcquire("203.0.113.1")).isTrue();
        clock.advance(Duration.ofMinutes(4));
        assertThat(limiter.tryAcquire("203.0.113.1")).isTrue();
        assertThat(limiter.tryAcquire("203.0.113.1")).isTrue();
        assertThat(limiter.tryAcquire("203.0.113.1")).isFalse();

        // Only the first event has aged out, so exactly one slot is free again.
        clock.advance(Duration.ofMinutes(6).plusSeconds(1));
        assertThat(limiter.tryAcquire("203.0.113.1")).isTrue();
        assertThat(limiter.tryAcquire("203.0.113.1")).isFalse();
    }

    @Test
    void keysAreIndependentAndBlankKeysShareOneBucket() {
        SlidingWindowRateLimiter limiter = new SlidingWindowRateLimiter(1, Duration.ofMinutes(1), clock);

        assertThat(limiter.tryAcquire("a")).isTrue();
        assertThat(limiter.tryAcquire("b")).isTrue();
        assertThat(limiter.tryAcquire("a")).isFalse();

        assertThat(limiter.tryAcquire(null)).isTrue();
        assertThat(limiter.tryAcquire("  ")).isFalse();
    }

    @Test
    void recordedFailuresExhaustTheWindowAndResetClearsThem() {
        SlidingWindowRateLimiter limiter = new SlidingWindowRateLimiter(2, Duration.ofMinutes(15), clock);

        assertThat(limiter.isExhausted("2026000001")).isFalse();
        limiter.record("2026000001");
        assertThat(limiter.isExhausted("2026000001")).isFalse();
        limiter.record("2026000001");
        assertThat(limiter.isExhausted("2026000001")).isTrue();

        limiter.reset("2026000001");
        assertThat(limiter.isExhausted("2026000001")).isFalse();

        limiter.record("2026000001");
        limiter.record("2026000001");
        clock.advance(Duration.ofMinutes(15).plusSeconds(1));
        assertThat(limiter.isExhausted("2026000001")).isFalse();
    }

    @Test
    void expiredKeysArePurgedSoTheMapCannotGrowForever() {
        SlidingWindowRateLimiter limiter = new SlidingWindowRateLimiter(5, Duration.ofSeconds(30), clock);
        for (int client = 0; client < 500; client++) {
            limiter.tryAcquire("client-" + client);
        }
        clock.advance(Duration.ofMinutes(1));

        // Enough calls to cross an eviction pass; every earlier key is expired by now.
        for (int call = 0; call < 200; call++) {
            limiter.tryAcquire("still-active");
            limiter.isExhausted("client-" + call);
        }

        for (int client = 0; client < 500; client++) {
            assertThat(limiter.isExhausted("client-" + client)).isFalse();
        }
        assertThat(limiter.tryAcquire("client-0")).isTrue();
    }

    @Test
    void rejectsNonPositiveLimit() {
        assertThatThrownBy(() -> new SlidingWindowRateLimiter(0, Duration.ofMinutes(1), clock))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant start) {
            this.now = start;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
