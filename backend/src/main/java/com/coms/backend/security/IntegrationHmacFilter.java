package com.coms.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * Authenticates inbound server-to-server calls under /api/integrations/** using
 * HMAC-SHA256(secret, timestamp + "." + rawBody). Replay window is 5 minutes.
 * Skips Spring Security's JWT filter — callers do not have user tokens.
 */
@Component
public class IntegrationHmacFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(IntegrationHmacFilter.class);
    private static final long REPLAY_WINDOW_SECONDS = 300L;
    private static final String PATH_PREFIX = "/api/integrations/";
    private static final String SIGNATURE_HEADER = "X-Integration-Signature";
    private static final String TIMESTAMP_HEADER = "X-Integration-Timestamp";
    private static final int MAX_REQUEST_BODY_BYTES = 1024 * 1024;

    private final byte[] secretBytes;
    private final Clock clock;

    public IntegrationHmacFilter(@Value("${integration.hmac-secret:}") String secret, Clock clock) {
        this.secretBytes = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path == null || !path.startsWith(PATH_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (secretBytes.length < 32) {
            log.warn("Integration HMAC secret missing or too short (need >=32 bytes); rejecting {}", path);
            response.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE, "Integration disabled");
            return;
        }

        String signatureHeader = request.getHeader(SIGNATURE_HEADER);
        String timestampHeader = request.getHeader(TIMESTAMP_HEADER);
        if (signatureHeader == null || signatureHeader.isBlank() || timestampHeader == null || timestampHeader.isBlank()) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Missing integration auth headers");
            return;
        }

        long timestamp;
        try {
            timestamp = Long.parseLong(timestampHeader.trim());
        } catch (NumberFormatException e) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid timestamp");
            return;
        }
        long now = Instant.now(clock).getEpochSecond();
        if (Math.abs(now - timestamp) > REPLAY_WINDOW_SECONDS) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Stale or future-dated request");
            return;
        }

        if (request.getContentLengthLong() > MAX_REQUEST_BODY_BYTES) {
            response.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, "Integration request body too large");
            return;
        }

        byte[] body;
        try {
            body = readBodyWithinLimit(request);
        } catch (RequestBodyTooLargeException e) {
            response.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, "Integration request body too large");
            return;
        }
        String expected = hmacHex(timestampHeader.trim() + "." + new String(body, StandardCharsets.UTF_8));
        if (!constantTimeEquals(expected, signatureHeader.trim())) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Bad signature");
            return;
        }

        var auth = new UsernamePasswordAuthenticationToken(
                "integration",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_INTEGRATION"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
        try {
            filterChain.doFilter(new CachedBodyRequest(request, body), response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private static byte[] readBodyWithinLimit(HttpServletRequest request) throws IOException, RequestBodyTooLargeException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(Math.max(request.getContentLength(), 0), MAX_REQUEST_BODY_BYTES));
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        var input = request.getInputStream();
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > MAX_REQUEST_BODY_BYTES) {
                throw new RequestBodyTooLargeException();
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    String hmacHex(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretBytes, "HmacSHA256"));
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(raw.length * 2);
            for (byte b : raw) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("HMAC failure", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        byte[] aBytes = a.getBytes(StandardCharsets.UTF_8);
        byte[] bBytes = b.getBytes(StandardCharsets.UTF_8);
        if (aBytes.length != bBytes.length) {
            return false;
        }
        return MessageDigest.isEqual(aBytes, bBytes);
    }

    private static final class RequestBodyTooLargeException extends Exception {
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        CachedBodyRequest(HttpServletRequest delegate, byte[] body) {
            super(delegate);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream buffer = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public boolean isFinished() { return buffer.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener readListener) {}
                @Override public int read() { return buffer.read(); }
            };
        }
    }
}
