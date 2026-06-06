package com.coms.backend.controller;

import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.ChangePasswordRequest;
import com.coms.backend.dto.ConfirmEmailVerificationRequest;
import com.coms.backend.dto.ConfirmSignupEmailRequest;
import com.coms.backend.dto.EmailVerificationStatusResponse;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.RequestSignupEmailRequest;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.dto.UpdateProfileRequest;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.AuthService;
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

    private final AuthService authService;
    private final JwtTokenProvider jwtTokenProvider;
    private final boolean cookieSecure;

    public AuthController(AuthService authService,
                          JwtTokenProvider jwtTokenProvider,
                          @Value("${cookie.secure:false}") boolean cookieSecure) {
        this.authService = authService;
        this.jwtTokenProvider = jwtTokenProvider;
        this.cookieSecure = cookieSecure;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.signup(request));
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
        String refreshToken = null;
        if (servletRequest.getCookies() != null) {
            for (Cookie c : servletRequest.getCookies()) {
                if ("refreshToken".equals(c.getName())) { refreshToken = c.getValue(); break; }
            }
        }
        if (refreshToken == null || !jwtTokenProvider.validateToken(refreshToken) || !jwtTokenProvider.isRefreshToken(refreshToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String studentId = jwtTokenProvider.getStudentId(refreshToken);
        authService.ensureAccountNotBanned(studentId);
        String newAccessToken = jwtTokenProvider.generateToken(studentId);

        response.addHeader(HttpHeaders.SET_COOKIE, accessCookie(newAccessToken).toString());

        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("token", "")
                .httpOnly(true).secure(cookieSecure).sameSite("Lax")
                .maxAge(Duration.ZERO).path("/").build().toString());
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("refreshToken", "")
                .httpOnly(true).secure(cookieSecure).sameSite("Lax")
                .maxAge(Duration.ZERO).path("/api/auth/refresh").build().toString());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<MemberResponse> me(Authentication authentication) {
        return ResponseEntity.ok(authService.getMe(authentication.getName()));
    }

    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                               Authentication authentication) {
        authService.changePassword(authentication.getName(), request.currentPassword(), request.newPassword());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/profile")
    public ResponseEntity<MemberResponse> updateProfile(@Valid @RequestBody UpdateProfileRequest request,
                                                        Authentication authentication) {
        return ResponseEntity.ok(authService.updateProfile(authentication.getName(), request));
    }

    private static final java.util.Set<String> TRUSTED_PROXIES = java.util.Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1");

    private ResponseCookie accessCookie(String token) {
        return ResponseCookie.from("token", token)
                .httpOnly(true).secure(cookieSecure).sameSite("Lax")
                .path("/").build();
    }

    private ResponseCookie refreshCookie(String token, boolean rememberMe) {
        ResponseCookie.ResponseCookieBuilder cookie = ResponseCookie.from("refreshToken", token)
                .httpOnly(true).secure(cookieSecure).sameSite("Lax")
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
            @Valid @RequestBody RequestSignupEmailRequest request) {
        boolean verified = authService.requestSignupEmailVerification(request.studentId());
        String message = verified ? "이미 이메일 인증이 완료되었습니다." : "인증코드를 이메일로 보냈습니다.";
        return ResponseEntity.ok(new EmailVerificationStatusResponse(message, verified));
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
