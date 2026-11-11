package com.coms.backend.controller;

import com.coms.backend.dto.AskRequest;
import com.coms.backend.security.ClientIpResolver;
import com.coms.backend.service.AskService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AskControllerTest {
    @Test
    void publicPostUsesExistingClientIpResolverAndReturnsNoContent() throws Exception {
        AskService service = mock(AskService.class);
        ClientIpResolver resolver = mock(ClientIpResolver.class);
        HttpServletRequest servletRequest = mock(HttpServletRequest.class);
        when(resolver.resolve(servletRequest)).thenReturn("127.0.0.1");
        AskRequest request = new AskRequest("질문입니다", "guest@example.com", "", "", "/");

        assertThat(new AskController(service, resolver).ask(request, null, servletRequest).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        verify(service).send(request, null, "127.0.0.1");
        assertThat(AskController.class.getMethod("ask", AskRequest.class,
                        org.springframework.security.core.Authentication.class, HttpServletRequest.class)
                .getAnnotation(PostMapping.class).value()).containsExactly("/api/ask");
    }
}
