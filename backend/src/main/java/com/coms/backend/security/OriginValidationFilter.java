package com.coms.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class OriginValidationFilter extends OncePerRequestFilter {

    private final Set<String> allowedOrigins;

    public OriginValidationFilter(@Value("${cors.allowed-origins}") String allowedOrigins) {
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .map(OriginValidationFilter::normalizeOrigin)
                .collect(Collectors.toUnmodifiableSet());
        if (this.allowedOrigins.isEmpty()) {
            throw new IllegalStateException("cors.allowed-origins must be configured");
        }
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (isIntegrationPath(request) || isSafeMethod(request.getMethod()) || hasTrustedOriginEvidence(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        response.sendError(HttpServletResponse.SC_FORBIDDEN, "Untrusted request origin.");
    }

    private static boolean isIntegrationPath(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path != null && path.startsWith("/api/integrations/");
    }

    private boolean hasTrustedOriginEvidence(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank()) {
            return isAllowedOrigin(origin);
        }

        String referer = request.getHeader("Referer");
        if (referer != null && !referer.isBlank()) {
            return isAllowedReferer(referer);
        }

        return false;
    }

    private boolean isAllowedReferer(String referer) {
        try {
            URI uri = new URI(referer);
            return isAllowedOrigin(originOf(uri));
        } catch (URISyntaxException e) {
            return false;
        }
    }

    private boolean isAllowedOrigin(String origin) {
        String normalized = normalizeOrigin(origin);
        return normalized != null && allowedOrigins.contains(normalized);
    }

    private static boolean isSafeMethod(String method) {
        return HttpMethod.GET.matches(method)
                || HttpMethod.HEAD.matches(method)
                || HttpMethod.OPTIONS.matches(method)
                || HttpMethod.TRACE.matches(method);
    }

    private static String normalizeOrigin(String value) {
        try {
            URI uri = new URI(value);
            return originOf(uri);
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private static String originOf(URI uri) {
        if (uri.getScheme() == null || uri.getHost() == null) {
            return null;
        }
        String scheme = uri.getScheme().toLowerCase();
        String host = uri.getHost().toLowerCase();
        int port = uri.getPort();
        if (port < 0 || ("http".equals(scheme) && port == 80) || ("https".equals(scheme) && port == 443)) {
            return scheme + "://" + host;
        }
        return scheme + "://" + host + ":" + port;
    }
}
