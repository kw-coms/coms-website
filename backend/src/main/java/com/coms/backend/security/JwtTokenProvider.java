package com.coms.backend.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private static final long REFRESH_EXPIRATION = 7L * 24 * 60 * 60 * 1000;
    private static final long REMEMBERED_REFRESH_EXPIRATION = 30L * 24 * 60 * 60 * 1000;
    private static final String ISSUER = "coms-backend";
    private static final String AUDIENCE = "coms-app";
    private static final SecureRandom SESSION_ID_RANDOM = new SecureRandom();

    private final SecretKey key;
    private final long expiration;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration}") long expiration) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("jwt.secret must be configured — set a strong JWT_SECRET");
        }
        if ("change-me".equals(secret)) {
            throw new IllegalStateException("jwt.secret is set to the default placeholder 'change-me' — set a strong JWT_SECRET");
        }
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            throw new IllegalStateException("jwt.secret must be at least 32 characters — set a strong JWT_SECRET");
        }
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.expiration = expiration;
    }

    /** Access token without a session family — only for callers that predate refresh sessions (tests). */
    public String generateToken(String studentId, int tokenVersion) {
        return generateToken(studentId, tokenVersion, null);
    }

    /**
     * @param family the refresh-session family this access token belongs to. Logout only ever sees
     *               the access cookie, so carrying the family here is what lets it revoke just this
     *               device's session instead of every session the member has.
     */
    public String generateToken(String studentId, int tokenVersion, String family) {
        JwtBuilder builder = Jwts.builder()
                .subject(studentId)
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .id(UUID.randomUUID().toString())
                .claim("type", "access")
                .claim("tv", tokenVersion);
        if (family != null) {
            builder.claim("fam", family);
        }
        return builder
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * @param jti    this token's refresh-session id (the {@code refresh_sessions.jti} row key)
     * @param family the session family; equals {@code jti} for the first token of a login
     */
    public String generateRefreshToken(String studentId, boolean rememberMe, int tokenVersion,
                                       String jti, String family) {
        return Jwts.builder()
                .subject(studentId)
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .id(jti)
                .claim("type", "refresh")
                .claim("remember", rememberMe)
                .claim("tv", tokenVersion)
                .claim("fam", family)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + refreshLifetimeMillis(rememberMe)))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /** Lifetime of a refresh token, so callers can persist a matching {@code expires_at}. */
    public java.time.Duration refreshLifetime(boolean rememberMe) {
        return java.time.Duration.ofMillis(refreshLifetimeMillis(rememberMe));
    }

    private static long refreshLifetimeMillis(boolean rememberMe) {
        return rememberMe ? REMEMBERED_REFRESH_EXPIRATION : REFRESH_EXPIRATION;
    }

    /** New random session id: 32 lowercase hex chars, distinct from the UUIDs legacy tokens carry. */
    public static String newSessionId() {
        byte[] bytes = new byte[16];
        SESSION_ID_RANDOM.nextBytes(bytes);
        StringBuilder hex = new StringBuilder(32);
        for (byte b : bytes) {
            hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return hex.toString();
    }

    /** The token's refresh-session id, or {@code null} when it carries none. */
    public String getSessionId(String token) {
        try {
            return parser().parseSignedClaims(token).getPayload().getId();
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * The token's session family, or {@code null} for tokens issued before refresh sessions existed.
     * A missing family is the legacy marker: those tokens have no {@code refresh_sessions} row.
     */
    public String getFamily(String token) {
        try {
            Object family = parser().parseSignedClaims(token).getPayload().get("fam");
            return family instanceof String s && !s.isBlank() ? s : null;
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }

    public String getStudentId(String token) {
        return parser().parseSignedClaims(token).getPayload().getSubject();
    }

    public int getTokenVersion(String token) {
        Object tv = parser().parseSignedClaims(token).getPayload().get("tv");
        return tv instanceof Number ? ((Number) tv).intValue() : 0;
    }

    public boolean validateToken(String token) {
        try {
            parser().parseSignedClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public boolean isRefreshToken(String token) {
        try {
            Object type = parser().parseSignedClaims(token).getPayload().get("type");
            return "refresh".equals(type);
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public boolean isRememberedRefreshToken(String token) {
        try {
            Object remember = parser().parseSignedClaims(token).getPayload().get("remember");
            return Boolean.TRUE.equals(remember);
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    private JwtParser parser() {
        return Jwts.parser()
                .verifyWith(key)
                .requireIssuer(ISSUER)
                .build();
    }
}
