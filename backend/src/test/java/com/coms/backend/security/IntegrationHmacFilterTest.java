package com.coms.backend.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.FilterChain;
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
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;

class IntegrationHmacFilterTest {
    private static final String SECRET = "unit-test-secret-1234567890-abcdef";
    private static final long FIXED_EPOCH = 1_700_000_000L;
    private static final int MAX_BODY_BYTES = 1024 * 1024;
    private static final Clock FIXED_CLOCK = Clock.fixed(Instant.ofEpochSecond(FIXED_EPOCH), ZoneOffset.UTC);

    private final IntegrationHmacFilter filter = new IntegrationHmacFilter(SECRET, FIXED_CLOCK);

    @Test
    void allowsValidSignature() throws Exception {
        String body = "{\"recipientStudentId\":\"2026000001\"}";
        String timestamp = String.valueOf(FIXED_EPOCH);
        String signature = sign(SECRET, timestamp + "." + body);

        MockFilterChain chain = new MockFilterChain();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsBadSignature() throws Exception {
        String body = "{\"recipientStudentId\":\"2026000001\"}";
        String timestamp = String.valueOf(FIXED_EPOCH);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", sign("wrong-secret-1234567890-abcdef-extra-padding", timestamp + "." + body));
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void rejectsStaleTimestamp() throws Exception {
        String body = "{}";
        String timestamp = String.valueOf(FIXED_EPOCH - 1000);
        String signature = sign(SECRET, timestamp + "." + body);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
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
    void allowsBodyAtConfiguredSizeLimit() throws Exception {
        String body = "a".repeat(MAX_BODY_BYTES);
        String timestamp = String.valueOf(FIXED_EPOCH);
        String signature = sign(SECRET, timestamp + "." + body);

        MockFilterChain chain = new MockFilterChain();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
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
        request.setContent("{}".getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(413);
    }

    @Test
    void rejectsOversizedChunkedBodyWhileReading() throws Exception {
        String body = "a".repeat(MAX_BODY_BYTES + 1);
        String timestamp = String.valueOf(FIXED_EPOCH);
        String signature = sign(SECRET, timestamp + "." + body);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications") {
            @Override
            public long getContentLengthLong() {
                return -1;
            }
        };
        request.addHeader("X-Integration-Signature", signature);
        request.addHeader("X-Integration-Timestamp", timestamp);
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

    private static final class MutableClock extends Clock {
        long epoch = FIXED_EPOCH;
        @Override public Instant instant() { return Instant.ofEpochSecond(epoch); }
        @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
    }

    private static int send(IntegrationHmacFilter f, long epoch, String body) throws Exception {
        String timestamp = String.valueOf(epoch);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", sign(SECRET, timestamp + "." + body));
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();
        f.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }

    @Test
    void rejectsExactReplayButAcceptsSameBodyWithNewTimestamp() throws Exception {
        MutableClock clock = new MutableClock();
        IntegrationHmacFilter f = new IntegrationHmacFilter(SECRET, clock);
        assertThat(send(f, FIXED_EPOCH, "{}")).isEqualTo(200);
        assertThat(send(f, FIXED_EPOCH, "{}")).isEqualTo(401);
        clock.epoch += 1;
        assertThat(send(f, clock.epoch, "{}")).isEqualTo(200);
    }

    @Test
    void rejectsRequestsOutsideTheWindowBothWays() throws Exception {
        IntegrationHmacFilter f = new IntegrationHmacFilter(SECRET, new MutableClock());
        assertThat(send(f, FIXED_EPOCH - 301, "{}")).isEqualTo(401);
        assertThat(send(f, FIXED_EPOCH + 301, "{}")).isEqualTo(401);
    }

    @Test
    void permitsRetryAfterDownstreamFailure() throws Exception {
        assertThat(sendWithChain(filter, "invalid-response", (request, response) ->
                ((MockHttpServletResponse) response).setStatus(400))).isEqualTo(400);
        assertThat(send(filter, FIXED_EPOCH, "invalid-response")).isEqualTo(200);

        assertThat(sendWithChain(filter, "failure-response", (request, response) ->
                ((MockHttpServletResponse) response).setStatus(500))).isEqualTo(500);
        assertThat(send(filter, FIXED_EPOCH, "failure-response")).isEqualTo(200);

        org.junit.jupiter.api.Assertions.assertThrows(ServletException.class,
                () -> sendWithChain(filter, "failure-exception", (request, response) -> {
                    throw new ServletException("temporary failure");
                }));
        assertThat(send(filter, FIXED_EPOCH, "failure-exception")).isEqualTo(200);
    }

    @Test
    void neverExceedsSignatureCapacityWithConcurrentRequests() throws Exception {
        IntegrationHmacFilter f = new IntegrationHmacFilter(SECRET, FIXED_CLOCK);
        Field field = IntegrationHmacFilter.class.getDeclaredField("usedSignatures");
        field.setAccessible(true);
        CyclicBarrier sizeReaders = new CyclicBarrier(2);
        AtomicInteger sizeCalls = new AtomicInteger();
        var signatures = new ConcurrentHashMap<String, Long>() {
            @Override
            public int size() {
                int size = super.size();
                if (sizeCalls.incrementAndGet() <= 2) {
                    try {
                        sizeReaders.await(500, TimeUnit.MILLISECONDS);
                    } catch (Exception ignored) {
                        // Serialized insertion makes the first reader wait for the other request.
                    }
                }
                return size;
            }
        };
        field.set(f, signatures);
        for (int i = 0; i < 49_999; i++) {
            signatures.put("existing-" + i, FIXED_EPOCH + 300);
        }

        int requests = 2;
        CountDownLatch start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(requests);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < requests; i++) {
                String body = "concurrent-" + i;
                results.add(executor.submit(() -> {
                    start.await();
                    return send(f, FIXED_EPOCH, body);
                }));
            }
            start.countDown();
            int accepted = 0;
            for (Future<Integer> result : results) {
                int status = result.get(20, TimeUnit.SECONDS);
                assertThat(status).isIn(200, 503);
                if (status == 200) accepted++;
            }
            assertThat(accepted).isEqualTo(1);
            assertThat(signatures).hasSize(50_000);
        } finally {
            executor.shutdownNow();
        }
    }

    private static int sendWithChain(IntegrationHmacFilter filter, String body, FilterChain chain) throws Exception {
        String timestamp = String.valueOf(FIXED_EPOCH);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/integrations/notifications");
        request.addHeader("X-Integration-Signature", sign(SECRET, timestamp + "." + body));
        request.addHeader("X-Integration-Timestamp", timestamp);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);
        return response.getStatus();
    }

    @Test
    void replayMemoryStaysBoundedAndRecoversWhenEntriesExpire() throws Exception {
        MutableClock clock = new MutableClock();
        IntegrationHmacFilter f = new IntegrationHmacFilter(SECRET, clock);
        for (int i = 0; i < 50_000; i++) {
            assertThat(send(f, FIXED_EPOCH, "{\"n\":" + i + "}")).isEqualTo(200);
        }
        assertThat(send(f, FIXED_EPOCH, "{\"n\":-1}")).isEqualTo(503);
        clock.epoch += 301;
        assertThat(send(f, clock.epoch, "{\"n\":-1}")).isEqualTo(200);
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
}
