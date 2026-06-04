package com.coms.backend.security;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

class OriginValidationFilterTest {

    private final OriginValidationFilter filter = new OriginValidationFilter("https://coms.kw.ac.kr,http://localhost:5173");

    @Test
    void rejectsUnsafeMethodWithUntrustedOrigin() throws Exception {
        MockHttpServletResponse response = filter("POST", "https://evil.example", null);

        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void allowsUnsafeMethodWithAllowedOrigin() throws Exception {
        MockHttpServletResponse response = filter("POST", "https://coms.kw.ac.kr", null);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void allowsSafeMethodWithoutTrustingOrigin() throws Exception {
        MockHttpServletResponse response = filter("GET", "https://evil.example", null);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsUnsafeMethodWithUntrustedRefererWhenOriginIsMissing() throws Exception {
        MockHttpServletResponse response = filter("DELETE", null, "https://evil.example/post");

        assertThat(response.getStatus()).isEqualTo(403);
    }

    private MockHttpServletResponse filter(String method, String origin, String referer)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest(method, "/api/community/posts");
        if (origin != null) {
            request.addHeader("Origin", origin);
        }
        if (referer != null) {
            request.addHeader("Referer", referer);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
