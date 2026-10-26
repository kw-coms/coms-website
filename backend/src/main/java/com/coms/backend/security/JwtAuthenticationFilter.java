package com.coms.backend.security;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RefreshSessionRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;
    private final UserDetailsService userDetailsService;
    private final MemberRepository memberRepository;
    private final RefreshSessionRepository refreshSessionRepository;

    /** Without session-family checks — for tests that predate refresh sessions. */
    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider, UserDetailsService userDetailsService,
                                   MemberRepository memberRepository) {
        this(tokenProvider, userDetailsService, memberRepository, null);
    }

    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider, UserDetailsService userDetailsService,
                                   MemberRepository memberRepository,
                                   RefreshSessionRepository refreshSessionRepository) {
        this.tokenProvider = tokenProvider;
        this.userDetailsService = userDetailsService;
        this.memberRepository = memberRepository;
        this.refreshSessionRepository = refreshSessionRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);
        if (token != null) {
            // One parse checks signature, issuer, audience, expiry and token type together.
            tokenProvider.parseAccessToken(token).ifPresent(this::authenticate);
        }
        filterChain.doFilter(request, response);
    }

    private void authenticate(JwtTokenProvider.AccessClaims claims) {
        try {
            Member member = memberRepository.findByStudentId(claims.studentId()).orElse(null);
            // Reject tokens whose version is stale: incrementing tokenVersion revokes all prior tokens.
            if (member == null || claims.tokenVersion() != member.getTokenVersion()) {
                return;
            }
            // Logout and refresh-token reuse detection revoke the device's session family. Its
            // access token must stop working then, not up to two hours later when it expires.
            // Rotation revokes and re-inserts inside one transaction, so a live family always
            // has a live row. Tokens without a family predate refresh sessions.
            if (claims.family() != null && refreshSessionRepository != null
                    && !refreshSessionRepository.existsByFamilyAndRevokedAtIsNull(claims.family())) {
                return;
            }
            var userDetails = userDetailsService.loadUserByUsername(claims.studentId());
            var auth = new UsernamePasswordAuthenticationToken(
                    userDetails, null, userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(auth);
        } catch (Exception e) {
            SecurityContextHolder.clearContext();
        }
    }

    private String extractToken(HttpServletRequest request) {
        // Prefer HttpOnly cookie
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("token".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        // Fallback: Authorization header for non-browser clients
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
