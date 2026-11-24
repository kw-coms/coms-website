package com.coms.backend.security;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

class IntegrationHmacFilterTest {
    private static final String SECRET = "unit-test-secret-1234567890-abcdef";
    private static final long FIXED_EPOCH = 1_700_000_000L;
    private static final String REQUEST_ID = "b2b-request-000001";
    private static final int MAX_BODY_BYTES = 1024 * 1024;
    private static final Clock FIXED_CLOCK = Clock.fixed(Instant.ofEpochSecond(FIXED_EPOCH), ZoneOffset.UTC);

    private final IntegrationHmacFilter filter = new IntegrationHmacFilter(SECRET, FIXED_CLOCK);

    @Test
    void allowsValidSignature() throws Exception {
        String body = "{\"recipientStudentId\":\"2026000001\"}";
        String timestamp = String.valueOf(FIXED_EPOCH);
        String signature = sign(SECRET, timestamp + "." + REQUEST_ID + "." + body);

        MockFilterChain chain = new MockFilterChain();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.addHeader("X-Integration-Request-Id", REQUEST_ID);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsReplayedRequestAndChangedRequestId() throws Exception {
        String body = "{}";
        String timestamp = String.valueOf(FIXED_EPOCH);
        String signature = sign(SECRET, timestamp + "." + REQUEST_ID + "." + body);

        MockHttpServletRequest first = signedRequest(timestamp, REQUEST_ID, signature, body);
        MockHttpServletResponse accepted = new MockHttpServletResponse();
        filter.doFilter(first, accepted, new MockFilterChain());
        assertThat(accepted.getStatus()).isEqualTo(200);

        MockHttpServletResponse replayed = new MockHttpServletResponse();
        filter.doFilter(signedRequest(timestamp, REQUEST_ID, signature, body), replayed, new MockFilterChain());
        assertThat(replayed.getStatus()).isEqualTo(401);

        MockHttpServletResponse changedId = new MockHttpServletResponse();
        filter.doFilter(signedRequest(timestamp, "b2b-request-000002", signature, body), changedId, new MockFilterChain());
        assertThat(changedId.getStatus()).isEqualTo(401);
    }

    @Test
    void acceptsOnlyOneOfTwoConcurrentCopies() throws Exception {
        String body = "{}";
        String timestamp = String.valueOf(FIXED_EPOCH);
        String signature = sign(SECRET, timestamp + "." + REQUEST_ID + "." + body);
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> {
                start.await();
                MockHttpServletResponse response = new MockHttpServletResponse();
                filter.doFilter(signedRequest(timestamp, REQUEST_ID, signature, body), response, new MockFilterChain());
                return response.getStatus();
            });
            var second = pool.submit(() -> {
                start.await();
                MockHttpServletResponse response = new MockHttpServletResponse();
                filter.doFilter(signedRequest(timestamp, REQUEST_ID, signature, body), response, new MockFilterChain());
                return response.getStatus();
            });
            start.countDown();
            assertThat(first.get() + second.get()).isEqualTo(200 + 401);
        }
    }

    @Test
    void acceptsRequestIdAgainAfterItsWindowExpires() throws Exception {
        class MutableClock extends Clock {
            long epoch = FIXED_EPOCH;
            @Override public Instant instant() { return Instant.ofEpochSecond(epoch); }
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        }
        MutableClock clock = new MutableClock();
        IntegrationHmacFilter movingFilter = new IntegrationHmacFilter(SECRET, clock);
        String body = "{}";
        String firstTime = String.valueOf(FIXED_EPOCH);
        MockHttpServletResponse first = new MockHttpServletResponse();
        movingFilter.doFilter(signedRequest(firstTime, REQUEST_ID,
                sign(SECRET, firstTime + "." + REQUEST_ID + "." + body), body), first, new MockFilterChain());
        assertThat(first.getStatus()).isEqualTo(200);

        clock.epoch += 301;
        String nextTime = String.valueOf(clock.epoch);
        MockHttpServletResponse next = new MockHttpServletResponse();
        movingFilter.doFilter(signedRequest(nextTime, REQUEST_ID,
                sign(SECRET, nextTime + "." + REQUEST_ID + "." + body), body), next, new MockFilterChain());
        assertThat(next.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsBadSignature() throws Exception {
        String body = "{\"recipientStudentId\":\"2026000001\"}";
        String timestamp = String.valueOf(FIXED_EPOCH);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", sign("wrong-secret-1234567890-abcdef-extra-padding", timestamp + "." + REQUEST_ID + "." + body));
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.addHeader("X-Integration-Request-Id", REQUEST_ID);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void rejectsStaleTimestamp() throws Exception {
        String body = "{}";
        String timestamp = String.valueOf(FIXED_EPOCH - 1000);
        String signature = sign(SECRET, timestamp + "." + REQUEST_ID + "." + body);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.addHeader("X-Integration-Request-Id", REQUEST_ID);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void rejectsMissingHeaders() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.setContent("{}".getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void rejectsMissingRequestIdWithOtherwiseValidLegacySignature() throws Exception {
        String body = "{}";
        String timestamp = String.valueOf(FIXED_EPOCH);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", sign(SECRET, timestamp + "." + body));
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void allowsBodyAtConfiguredSizeLimit() throws Exception {
        String body = "a".repeat(MAX_BODY_BYTES);
        String timestamp = String.valueOf(FIXED_EPOCH);
        String signature = sign(SECRET, timestamp + "." + REQUEST_ID + "." + body);

        MockFilterChain chain = new MockFilterChain();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.addHeader("X-Integration-Request-Id", REQUEST_ID);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsOversizedContentLengthBeforeReadingBody() throws Exception {
        String timestamp = String.valueOf(FIXED_EPOCH);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications") {
            @Override
            public long getContentLengthLong() {
                return MAX_BODY_BYTES + 1L;
            }
        };
        request.addHeader("X-Integration-Signature", "unused");
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.addHeader("X-Integration-Request-Id", REQUEST_ID);
        request.setContent("{}".getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(413);
    }

    @Test
    void rejectsOversizedChunkedBodyWhileReading() throws Exception {
        String body = "a".repeat(MAX_BODY_BYTES + 1);
        String timestamp = String.valueOf(FIXED_EPOCH);
        String signature = sign(SECRET, timestamp + "." + REQUEST_ID + "." + body);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications") {
            @Override
            public long getContentLengthLong() {
                return -1;
            }
        };
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.addHeader("X-Integration-Request-Id", REQUEST_ID);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(413);
    }

    @Test
    void skipsNonIntegrationPaths() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/community/posts");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsWhenSecretMissing() throws Exception {
        IntegrationHmacFilter emptySecretFilter = new IntegrationHmacFilter("", FIXED_CLOCK);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", "deadbeef");
        request.addHeader("X-Integration-Timestamp", String.valueOf(FIXED_EPOCH));
        request.setContent("{}".getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        emptySecretFilter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(503);
    }

    private static String sign(String secret, String payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder(raw.length * 2);
        for (byte b : raw) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private static MockHttpServletRequest signedRequest(String timestamp, String requestId, String signature, String body) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.addHeader("X-Integration-Request-Id", requestId);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        return request;
    }
}
