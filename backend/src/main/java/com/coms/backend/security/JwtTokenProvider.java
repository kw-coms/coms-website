package com.coms.backend.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private static final long REFRESH_EXPIRATION = 7L * 24 * 60 * 60 * 1000;
    private static final long REMEMBERED_REFRESH_EXPIRATION = 30L * 24 * 60 * 60 * 1000;
    private static final String ISSUER = "coms-backend";
    private static final String AUDIENCE = "coms-app";

    private final SecretKey key;
    private final long expiration;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration}") long expiration) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            throw new IllegalArgumentException("jwt.secret must be at least 32 characters");
        }
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.expiration = expiration;
    }

    public String generateToken(String studentId) {
        return Jwts.builder()
                .subject(studentId)
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .id(UUID.randomUUID().toString())
                .claim("type", "access")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public String generateRefreshToken(String studentId, boolean rememberMe) {
        long refreshExpiration = rememberMe ? REMEMBERED_REFRESH_EXPIRATION : REFRESH_EXPIRATION;
        return Jwts.builder()
                .subject(studentId)
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .id(UUID.randomUUID().toString())
                .claim("type", "refresh")
                .claim("remember", rememberMe)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + refreshExpiration))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public String getStudentId(String token) {
        return parser().parseSignedClaims(token).getPayload().getSubject();
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
