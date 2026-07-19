package com.coms.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

/**
 * Owns the anonymous poster identity: the display name shown for ANONYMOUS posts/comments and the
 * short, salted, opaque IP tag appended to it. The tag is derived with HMAC so the same client IP
 * stays linkable within a thread while revealing nothing about the real network — the full IP stays
 * in the database for admin moderation only.
 */
@Component
class AnonymousIdentityService {
    private static final String DEFAULT_ANONYMOUS_NAME = "ㅇㅇ";
    private static final int MAX_ANONYMOUS_NAME_LENGTH = 20;
    private static final String IP_TAG_CONTEXT = "coms-anonymous-ip-tag-v1";

    private final CommunityTextService textService;
    private final byte[] anonymousTagKey;

    AnonymousIdentityService(CommunityTextService textService,
                             @Value("${community.anonymous-salt:}") String anonymousSalt,
                             @Value("${jwt.secret:}") String jwtSecret) {
        this.textService = textService;
        this.anonymousTagKey = resolveAnonymousTagKey(anonymousSalt, jwtSecret);
    }

    /**
     * Resolves the HMAC key used to tag anonymous posters. A dedicated {@code community.anonymous-salt}
     * is used as-is. Otherwise a separate key is derived from {@code jwt.secret} via HMAC over a fixed
     * context label, so the signing secret is never reused directly as the IP-tag key (key separation).
     */
    private static byte[] resolveAnonymousTagKey(String anonymousSalt, String jwtSecret) {
        if (anonymousSalt != null && !anonymousSalt.isBlank()) {
            return anonymousSalt.getBytes(StandardCharsets.UTF_8);
        }
        String base = jwtSecret == null || jwtSecret.isBlank() ? "coms-anonymous-display-salt" : jwtSecret;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(base.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(IP_TAG_CONTEXT.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to derive anonymous tag key", e);
        }
    }

    String normalizeAnonymousName(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) return DEFAULT_ANONYMOUS_NAME;
        if (normalized.length() > MAX_ANONYMOUS_NAME_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "익명 이름은 " + MAX_ANONYMOUS_NAME_LENGTH + "자 이하로 입력해주세요.");
        }
        textService.rejectUnsafeText(normalized);
        return normalized;
    }

    String anonymousDisplayName(String anonymousName, String ipAddress) {
        String name = normalizeAnonymousName(anonymousName);
        String tag = anonymousTag(ipAddress);
        return tag == null ? name : name + "(" + tag + ")";
    }

    /**
     * Derives a short, opaque, salted tag from the client IP. Same IP yields the same tag (so
     * sockpuppets within a thread stay linkable) while revealing nothing about the real network —
     * unlike a raw IP prefix, which deanonymizes posters in a small community.
     */
    private String anonymousTag(String ipAddress) {
        if (ipAddress == null || ipAddress.isBlank()) return null;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(anonymousTagKey, "HmacSHA256"));
            byte[] digest = mac.doFinal(ipAddress.trim().getBytes(StandardCharsets.UTF_8));
            return String.format("%02x%02x", digest[0] & 0xff, digest[1] & 0xff);
        } catch (Exception e) {
            return null;
        }
    }
}
