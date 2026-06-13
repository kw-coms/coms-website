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

import static org.assertj.core.api.Assertions.assertThat;

class IntegrationHmacFilterTest {
    private static final String SECRET = "unit-test-secret-1234567890-abcdef";
    private static final long FIXED_EPOCH = 1_700_000_000L;
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
}
