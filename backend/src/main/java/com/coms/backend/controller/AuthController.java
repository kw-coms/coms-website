package com.coms.backend.controller;

import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.ChangePasswordRequest;
import com.coms.backend.dto.ConfirmEmailVerificationRequest;
import com.coms.backend.dto.ConfirmPasswordResetRequest;
import com.coms.backend.dto.ConfirmSignupEmailRequest;
import com.coms.backend.dto.EmailVerificationStatusResponse;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.PasswordResetStatusResponse;
import com.coms.backend.dto.RequestPasswordResetRequest;
import com.coms.backend.dto.RequestSignupEmailRequest;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.dto.UpdateProfileRequest;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.AuthService;
import com.coms.backend.service.RefreshSessionService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Duration REMEMBERED_REFRESH_COOKIE_AGE = Duration.ofDays(30);

    private static final java.util.Set<String> VALID_SAME_SITE = java.util.Set.of("Lax", "Strict", "None");

    private final AuthService authService;
    private final JwtTokenProvider jwtTokenProvider;
    private final com.coms.backend.service.AdminService adminService;
    private final RefreshSessionService refreshSessionService;
    private final boolean cookieSecure;
    private final String cookieSameSite;

    public AuthController(AuthService authService,
                          JwtTokenProvider jwtTokenProvider,
                          com.coms.backend.service.AdminService adminService,
                          RefreshSessionService refreshSessionService,
                          @Value("${cookie.secure:false}") boolean cookieSecure,
                          @Value("${cookie.same-site:Lax}") String cookieSameSite) {
        this.authService = authService;
        this.jwtTokenProvider = jwtTokenProvider;
        this.adminService = adminService;
        this.refreshSessionService = refreshSessionService;
        this.cookieSecure = cookieSecure;
        String requested = cookieSameSite == null ? "Lax" : cookieSameSite.trim();
        // SameSite=None requires Secure=true per RFC; if the deployer mis-paired the flags, log and fall back to Lax.
        if ("None".equalsIgnoreCase(requested) && !cookieSecure) {
            org.slf4j.LoggerFactory.getLogger(AuthController.class)
                    .warn("cookie.same-site=None requires cookie.secure=true; falling back to Lax");
            this.cookieSameSite = "Lax";
        } else if (!VALID_SAME_SITE.contains(requested)) {
            org.slf4j.LoggerFactory.getLogger(AuthController.class)
                    .warn("cookie.same-site={} is not one of Lax/Strict/None; falling back to Lax", requested);
            this.cookieSameSite = "Lax";
        } else {
            this.cookieSameSite = requested.substring(0, 1).toUpperCase() + requested.substring(1).toLowerCase();
        }
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest request,
                                               HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(authService.signup(request, resolveClientIp(servletRequest)));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request,
                                              HttpServletRequest servletRequest,
                                              HttpServletResponse response) {
        String clientIp = resolveClientIp(servletRequest);
        AuthResponse auth = authService.login(request, clientIp);

        response.addHeader(HttpHeaders.SET_COOKIE, accessCookie(auth.token()).toString());
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie(auth.refreshToken(), request.rememberMe()).toString());

        return ResponseEntity.ok(new AuthResponse(null, auth.studentId(), auth.name(), auth.message()));
    }

    @PostMapping("/refresh")
    public ResponseEntity<Void> refresh(HttpServletRequest servletRequest, HttpServletResponse response) {
        String refreshToken = readCookie(servletRequest, "refreshToken");
        if (refreshToken == null || !jwtTokenProvider.validateToken(refreshToken) || !jwtTokenProvider.isRefreshToken(refreshToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String studentId = jwtTokenProvider.getStudentId(refreshToken);
        authService.ensureAccountNotBanned(studentId);

        // Reject revoked refresh tokens (stale token version).
        int currentTokenVersion = authService.getCurrentTokenVersion(studentId);
        if (jwtTokenProvider.getTokenVersion(refreshToken) != currentTokenVersion) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        boolean rememberMe = jwtTokenProvider.isRememberedRefreshToken(refreshToken);
        String family = jwtTokenProvider.getFamily(refreshToken);

        RefreshSessionService.Result session;
        if (family == null) {
            // Legacy token issued before refresh sessions existed: it has no row and never will.
            // Accepting it once (the JWT itself is valid and the token version matches) is what
            // keeps the deploy from logging every signed-in member out; the replacement token
            // carries a family, so this branch is unreachable for it from here on.
            session = refreshSessionService.openSession(studentId, rememberMe);
        } else {
            session = refreshSessionService.rotate(
                    studentId, jwtTokenProvider.getSessionId(refreshToken), family, rememberMe);
        }
        if (session.outcome() == RefreshSessionService.Outcome.RACE_LOSER) {
            // A parallel refresh from the SAME client already rotated this token and its Set-Cookie
            // landed in the same cookie jar. Answer 204 with no cookies so the loser's retry rides
            // the winner's cookies. A 401 here would make clients without single-flight refresh
            // (member app <= v0.2.x fires one refresh per concurrent 401) treat a cold boot as an
            // expired session and log out. Nothing is issued, so a replay from elsewhere gains nothing.
            return ResponseEntity.noContent().build();
        }
        if (session.outcome() != RefreshSessionService.Outcome.ROTATED) {
            // REUSE_DETECTED already revoked the family; REJECTED has no live session at all.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String newAccessToken = jwtTokenProvider.generateToken(studentId, currentTokenVersion, session.family());
        String newRefreshToken = jwtTokenProvider.generateRefreshToken(
                studentId, rememberMe, currentTokenVersion, session.jti(), session.family());

        response.addHeader(HttpHeaders.SET_COOKIE, accessCookie(newAccessToken).toString());
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie(newRefreshToken, rememberMe).toString());

        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest servletRequest, HttpServletResponse response) {
        // Per-device logout: revoke only the refresh-session family this access token belongs to,
        // so the member's other devices stay signed in. The access token itself is not revocable
        // without bumping the shared token version, so it stays usable until it expires (2h).
        // The access cookie ("token", path "/") is the one delivered to this endpoint.
        String accessToken = readCookie(servletRequest, "token");
        if (accessToken != null && jwtTokenProvider.validateToken(accessToken) && !jwtTokenProvider.isRefreshToken(accessToken)) {
            String family = jwtTokenProvider.getFamily(accessToken);
            if (family != null) {
                refreshSessionService.revokeFamily(family);
            } else {
                // Legacy access token with no family — fall back to the old all-devices behavior.
                authService.revokeAllSessions(jwtTokenProvider.getStudentId(accessToken));
            }
        }

        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("token", "")
                .httpOnly(true).secure(cookieSecure).sameSite(cookieSameSite)
                .maxAge(Duration.ZERO).path("/").build().toString());
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("refreshToken", "")
                .httpOnly(true).secure(cookieSecure).sameSite(cookieSameSite)
                .maxAge(Duration.ZERO).path("/api/auth/refresh").build().toString());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<MemberResponse> me(Authentication authentication) {
        return ResponseEntity.ok(authService.getMe(authentication.getName()));
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> withdraw(Authentication authentication, HttpServletResponse response) {
        adminService.deleteByStudentId(authentication.getName());
        // Best-effort: clear the auth cookies so the freshly deleted account can't continue using its tokens.
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("token", "")
                .httpOnly(true).secure(cookieSecure).sameSite(cookieSameSite)
                .maxAge(Duration.ZERO).path("/").build().toString());
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("refreshToken", "")
                .httpOnly(true).secure(cookieSecure).sameSite(cookieSameSite)
                .maxAge(Duration.ZERO).path("/api/auth/refresh").build().toString());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                               Authentication authentication) {
        authService.changePassword(authentication.getName(), request.currentPassword(), request.newPassword());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password-reset/request")
    public ResponseEntity<PasswordResetStatusResponse> requestPasswordReset(
            @Valid @RequestBody RequestPasswordResetRequest request) {
        authService.requestPasswordReset(request.studentId(), request.email());
        return ResponseEntity.ok(new PasswordResetStatusResponse("입력 정보와 일치하는 계정이 있다면 인증코드를 이메일로 보냈습니다."));
    }

    @PostMapping("/password-reset/confirm")
    public ResponseEntity<PasswordResetStatusResponse> confirmPasswordReset(
            @Valid @RequestBody ConfirmPasswordResetRequest request) {
        authService.confirmPasswordReset(request.studentId(), request.email(), request.code(), request.newPassword());
        return ResponseEntity.ok(new PasswordResetStatusResponse("비밀번호가 재설정되었습니다."));
    }

    @PatchMapping("/profile")
    public ResponseEntity<MemberResponse> updateProfile(@Valid @RequestBody UpdateProfileRequest request,
                                                        Authentication authentication) {
        return ResponseEntity.ok(authService.updateProfile(authentication.getName(), request));
    }

    private static final java.util.Set<String> TRUSTED_PROXIES = java.util.Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1");

    private static String readCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private ResponseCookie accessCookie(String token) {
        return ResponseCookie.from("token", token)
                .httpOnly(true).secure(cookieSecure).sameSite(cookieSameSite)
                .path("/").build();
    }

    private ResponseCookie refreshCookie(String token, boolean rememberMe) {
        ResponseCookie.ResponseCookieBuilder cookie = ResponseCookie.from("refreshToken", token)
                .httpOnly(true).secure(cookieSecure).sameSite(cookieSameSite)
                .path("/api/auth/refresh");
        if (rememberMe) {
            cookie.maxAge(REMEMBERED_REFRESH_COOKIE_AGE);
        }
        return cookie.build();
    }

    private static String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (TRUSTED_PROXIES.contains(remoteAddr)) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                String candidate = forwarded.split(",")[0].trim();
                if (isValidIp(candidate)) return candidate;
            }
            String realIp = request.getHeader("X-Real-IP");
            if (realIp != null && !realIp.isBlank() && isValidIp(realIp.trim())) {
                return realIp.trim();
            }
        }
        return remoteAddr;
    }

    private static boolean isValidIp(String ip) {
        if (ip == null || ip.length() > 45) return false;
        try {
            java.net.InetAddress.getByName(ip);
            return !ip.contains(" ");
        } catch (java.net.UnknownHostException e) {
            return false;
        }
    }

    @PostMapping("/email-verification/request-signup")
    public ResponseEntity<EmailVerificationStatusResponse> requestSignupEmail(
            @Valid @RequestBody RequestSignupEmailRequest request,
            HttpServletRequest servletRequest) {
        // Constant response regardless of whether the identifier resolves — the service masks
        // enumeration and rate-limits by IP internally.
        authService.requestSignupEmailVerification(request.studentId(), resolveClientIp(servletRequest));
        return ResponseEntity.ok(new EmailVerificationStatusResponse("인증코드를 이메일로 보냈습니다.", false));
    }

    @PostMapping("/email-verification/confirm-signup")
    public ResponseEntity<EmailVerificationStatusResponse> confirmSignupEmail(
            @Valid @RequestBody ConfirmSignupEmailRequest request) {
        boolean verified = authService.confirmSignupEmailVerification(request.studentId(), request.code());
        return ResponseEntity.ok(new EmailVerificationStatusResponse("이메일 인증이 완료되었습니다.", verified));
    }

    @PostMapping("/email-verification/request")
    public ResponseEntity<EmailVerificationStatusResponse> requestEmailVerification(Authentication authentication) {
        boolean verified = authService.requestEmailVerification(authentication.getName());
        String message = verified ? "이미 이메일 인증이 완료되었습니다." : "인증코드를 이메일로 보냈습니다.";
        return ResponseEntity.ok(new EmailVerificationStatusResponse(message, verified));
    }

    @PostMapping("/email-verification/confirm")
    public ResponseEntity<EmailVerificationStatusResponse> confirmEmailVerification(
            @Valid @RequestBody ConfirmEmailVerificationRequest request,
            Authentication authentication) {
        boolean verified = authService.confirmEmailVerification(authentication.getName(), request.code());
        return ResponseEntity.ok(new EmailVerificationStatusResponse("이메일 인증이 완료되었습니다.", verified));
    }
}
