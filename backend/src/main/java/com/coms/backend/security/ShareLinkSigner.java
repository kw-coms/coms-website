package com.coms.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;

/**
 * Signs community share links ({@code /community/{id}?s=...}).
 *
 * <p>Link-preview crawlers (KakaoTalk, Slack, ...) fetch a shared post without a session, so the
 * share endpoints have to answer anonymously. Without a signature anyone could walk post ids and
 * read every members-only post's title and first image. A signature is handed out only to members
 * who can read the post, and the share endpoints show the post's own preview only when it matches;
 * otherwise they serve the same generic card for every id.
 *
 * <p>The key is derived from the JWT secret under a separate label, so a share signature can never
 * stand in for (or help forge) a token, and no new secret has to be configured.
 */
@Component
public class ShareLinkSigner {

    private static final String ALGORITHM = "HmacSHA256";
    private static final String KEY_LABEL = "coms-community-share-link-v1";
    /** 128 bits: unguessable, and short enough (22 characters) to keep shared URLs tidy. */
    private static final int SIGNATURE_BYTES = 16;
    private static final int SIGNATURE_LENGTH = 22;

    private final SecretKeySpec key;

    public ShareLinkSigner(@Value("${jwt.secret}") String jwtSecret) {
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException("jwt.secret must be configured");
        }
        byte[] derived = hmac(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), ALGORITHM), KEY_LABEL);
        this.key = new SecretKeySpec(derived, ALGORITHM);
    }

    public String sign(long postId) {
        byte[] mac = hmac(key, "community-post:" + postId);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(Arrays.copyOf(mac, SIGNATURE_BYTES));
    }

    public boolean verify(Long postId, String signature) {
        if (postId == null || signature == null || signature.length() != SIGNATURE_LENGTH) {
            return false;
        }
        return MessageDigest.isEqual(
                sign(postId).getBytes(StandardCharsets.US_ASCII),
                signature.getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] hmac(SecretKeySpec key, String message) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(key);
            return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 is unavailable", e);
        }
    }
}
