package com.coms.backend.controller;

import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthControllerCookieTest {
    private final AuthService authService = mock(AuthService.class);
    private final JwtTokenProvider jwtTokenProvider = mock(JwtTokenProvider.class);
    private final AuthController controller = new AuthController(authService, jwtTokenProvider, true, "Lax");

    @Test
    void regularLoginUsesSessionCookies() {
        when(authService.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AuthResponse("access", "2026123456", "홍길동", "ok", "refresh"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        controller.login(new LoginRequest("2026123456", "Password1!", false), new MockHttpServletRequest(), response);

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).allSatisfy(cookie -> assertThat(cookie).doesNotContain("Max-Age"));
        assertThat(cookies).allSatisfy(cookie -> assertThat(cookie).contains("SameSite=Lax"));
    }

    @Test
    void rememberedLoginPersistsOnlyRefreshCookie() {
        when(authService.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AuthResponse("access", "2026123456", "홍길동", "ok", "refresh"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        controller.login(new LoginRequest("2026123456", "Password1!", true), new MockHttpServletRequest(), response);

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).anySatisfy(cookie -> assertThat(cookie).contains("refreshToken=refresh", "Max-Age=2592000"));
        assertThat(cookies).anySatisfy(cookie -> assertThat(cookie).contains("token=access").doesNotContain("Max-Age"));
    }

    @Test
    void sameSiteNoneIsHonoredWhenSecure() {
        AuthController noneController = new AuthController(authService, jwtTokenProvider, true, "None");
        when(authService.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AuthResponse("access", "2026123456", "홍길동", "ok", "refresh"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        noneController.login(new LoginRequest("2026123456", "Password1!", false), new MockHttpServletRequest(), response);

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).allSatisfy(cookie -> assertThat(cookie).contains("SameSite=None").contains("Secure"));
    }

    @Test
    void sameSiteNoneWithoutSecureDegradesToLax() {
        AuthController unsafeNone = new AuthController(authService, jwtTokenProvider, false, "None");
        when(authService.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AuthResponse("access", "2026123456", "홍길동", "ok", "refresh"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        unsafeNone.login(new LoginRequest("2026123456", "Password1!", false), new MockHttpServletRequest(), response);

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).allSatisfy(cookie -> assertThat(cookie).contains("SameSite=Lax"));
    }

    @Test
    void unknownSameSiteFallsBackToLax() {
        AuthController bogus = new AuthController(authService, jwtTokenProvider, true, "Weird");
        when(authService.login(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new AuthResponse("access", "2026123456", "홍길동", "ok", "refresh"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        bogus.login(new LoginRequest("2026123456", "Password1!", false), new MockHttpServletRequest(), response);

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).allSatisfy(cookie -> assertThat(cookie).contains("SameSite=Lax"));
    }
}
