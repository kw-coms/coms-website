package com.coms.backend.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * In-memory sliding-window limiter: at most {@code maxPerWindow} events per key (client IP,
 * student id, ...) within {@code window}. One instance per limit.
 *
 * <p>State lives in this JVM only, which matches the single-instance deployment; a restart
 * simply starts every window empty. Keys whose window has fully expired are purged as traffic
 * arrives, so the map cannot grow without bound.
 */
public final class SlidingWindowRateLimiter {

    private static final int EVICTION_INTERVAL = 64;

    private final int maxPerWindow;
    private final Duration window;
    private final Clock clock;
    private final Map<String, Deque<Instant>> eventsByKey = new ConcurrentHashMap<>();
    private final AtomicInteger callsSinceEviction = new AtomicInteger();

    public SlidingWindowRateLimiter(int maxPerWindow, Duration window, Clock clock) {
        if (maxPerWindow < 1) {
            throw new IllegalArgumentException("maxPerWindow must be at least 1");
        }
        this.maxPerWindow = maxPerWindow;
        this.window = window;
        this.clock = clock;
    }

    /** Counts one event for {@code key} unless its window is already full. */
    public boolean tryAcquire(String key) {
        Instant now = clock.instant();
        boolean[] allowed = {false};
        eventsByKey.compute(normalize(key), (ignored, existing) -> {
            Deque<Instant> events = dropExpired(existing == null ? new ArrayDeque<>() : existing, now);
            if (events.size() < maxPerWindow) {
                events.addLast(now);
                allowed[0] = true;
            }
            return events;
        });
        evictExpiredKeys(now);
        return allowed[0];
    }

    /** True when {@code key} has already used up its window. Does not count an event. */
    public boolean isExhausted(String key) {
        Instant now = clock.instant();
        boolean[] exhausted = {false};
        eventsByKey.computeIfPresent(normalize(key), (ignored, existing) -> {
            Deque<Instant> events = dropExpired(existing, now);
            exhausted[0] = events.size() >= maxPerWindow;
            return events.isEmpty() ? null : events;
        });
        return exhausted[0];
    }

    /** Counts one event for {@code key} regardless of the limit (e.g. a failed attempt). */
    public void record(String key) {
        Instant now = clock.instant();
        eventsByKey.compute(normalize(key), (ignored, existing) -> {
            Deque<Instant> events = dropExpired(existing == null ? new ArrayDeque<>() : existing, now);
            events.addLast(now);
            // Entries beyond the limit carry no extra information; keep the deque bounded.
            while (events.size() > maxPerWindow) {
                events.removeFirst();
            }
            return events;
        });
        evictExpiredKeys(now);
    }

    /** Forgets everything recorded for {@code key} (e.g. after the caller proved itself). */
    public void reset(String key) {
        eventsByKey.remove(normalize(key));
    }

    /** Test support: empties every window. */
    public void clear() {
        eventsByKey.clear();
    }

    private Deque<Instant> dropExpired(Deque<Instant> events, Instant now) {
        Instant cutoff = now.minus(window);
        while (!events.isEmpty() && !events.peekFirst().isAfter(cutoff)) {
            events.removeFirst();
        }
        return events;
    }

    private void evictExpiredKeys(Instant now) {
        if (callsSinceEviction.incrementAndGet() < EVICTION_INTERVAL) {
            return;
        }
        callsSinceEviction.set(0);
        for (String key : eventsByKey.keySet()) {
            eventsByKey.computeIfPresent(key, (ignored, events) -> dropExpired(events, now).isEmpty() ? null : events);
        }
    }

    private static String normalize(String key) {
        return key == null || key.isBlank() ? "unknown" : key.trim();
    }
}
