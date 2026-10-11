package com.coms.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * Refuses a request body larger than the ceiling before anything parses it.
 *
 * <p>Uploads have their own limits ({@code spring.servlet.multipart.*}, up to 210 MB) and the proxy
 * in front accepts bodies that large on every path. Nothing bounded a body that is not a multipart
 * upload, so a JSON endpoint — the anonymous ones included: login, signup, recruit apply — read and
 * parsed whatever it was sent, and a handful of large requests in parallel could exhaust the heap.
 *
 * <p>Multipart requests pass through untouched and keep their own limits.
 */
public class RequestBodyLimitFilter extends OncePerRequestFilter {

    /** Set on the request once a body without a declared length has run past the ceiling. */
    public static final String EXCEEDED_ATTRIBUTE = RequestBodyLimitFilter.class.getName() + ".exceeded";
    public static final String MESSAGE = "요청 본문이 너무 큽니다.";

    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final long maxBytes;

    public RequestBodyLimitFilter(long maxBytes) {
        if (maxBytes <= 0) {
            throw new IllegalArgumentException("app.max-request-body-bytes must be positive");
        }
        this.maxBytes = maxBytes;
    }

    /** True when {@link #EXCEEDED_ATTRIBUTE} was set: the read failure is a 413, not a malformed body. */
    public static boolean exceeded(HttpServletRequest request) {
        return request != null && Boolean.TRUE.equals(request.getAttribute(EXCEEDED_ATTRIBUTE));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (isMultipart(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        long declared = request.getContentLengthLong();
        if (declared > maxBytes) {
            reject(response);
            return;
        }
        if (declared < 0 && BODY_METHODS.contains(request.getMethod())) {
            // Chunked: there is no length to check up front, so count while the body is read.
            filterChain.doFilter(new LimitedRequest(request, maxBytes), response);
            return;
        }
        // A declared length within the ceiling needs no guard: the container never hands out
        // more bytes than were declared.
        filterChain.doFilter(request, response);
    }

    private static boolean isMultipart(HttpServletRequest request) {
        String contentType = request.getContentType();
        return contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("multipart/");
    }

    private static void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"message\":\"" + MESSAGE + "\"}");
    }

    /** Thrown from the body stream; the exception handler turns it into the same 413. */
    public static class RequestBodyTooLargeException extends IOException {
        public RequestBodyTooLargeException() {
            super("Request body exceeds the configured ceiling");
        }
    }

    private static final class LimitedRequest extends HttpServletRequestWrapper {
        private final long maxBytes;
        private ServletInputStream stream;
        private BufferedReader reader;

        LimitedRequest(HttpServletRequest request, long maxBytes) {
            super(request);
            this.maxBytes = maxBytes;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (stream == null) {
                stream = new LimitedStream(super.getInputStream(), maxBytes, (HttpServletRequest) getRequest());
            }
            return stream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            if (reader == null) {
                String encoding = getCharacterEncoding();
                Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
                reader = new BufferedReader(new InputStreamReader(getInputStream(), charset));
            }
            return reader;
        }
    }

    private static final class LimitedStream extends ServletInputStream {
        private final ServletInputStream delegate;
        private final long maxBytes;
        private final HttpServletRequest request;
        private long read;

        LimitedStream(ServletInputStream delegate, long maxBytes, HttpServletRequest request) {
            this.delegate = delegate;
            this.maxBytes = maxBytes;
            this.request = request;
        }

        @Override
        public int read() throws IOException {
            int value = delegate.read();
            if (value != -1) {
                count(1);
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int count = delegate.read(buffer, offset, length);
            if (count > 0) {
                count(count);
            }
            return count;
        }

        private void count(int bytes) throws IOException {
            read += bytes;
            if (read > maxBytes) {
                request.setAttribute(EXCEEDED_ATTRIBUTE, Boolean.TRUE);
                throw new RequestBodyTooLargeException();
            }
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            delegate.setReadListener(readListener);
        }

        @Override
        public int available() throws IOException {
            return delegate.available();
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }
    }
}
