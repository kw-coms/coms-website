package com.coms.backend.controller;

import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.service.AuthService;
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
                                              HttpServletResponse response) {
        AuthResponse auth = authService.login(request);

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
}
