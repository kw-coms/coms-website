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
import com.coms.backend.service.AuthService;
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

    private final AuthService authService;
    private final boolean cookieSecure;

    public AuthController(AuthService authService,
                          @Value("${cookie.secure:false}") boolean cookieSecure) {
        this.authService = authService;
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

        ResponseCookie cookie = ResponseCookie.from("token", auth.token())
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .maxAge(Duration.ofDays(1))
                .path("/")
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

        // Do not expose raw token in response body
        return ResponseEntity.ok(new AuthResponse(null, auth.studentId(), auth.name(), auth.message()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        ResponseCookie clearCookie = ResponseCookie.from("token", "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .maxAge(Duration.ZERO)
                .path("/")
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, clearCookie.toString());
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

    private static String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
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
