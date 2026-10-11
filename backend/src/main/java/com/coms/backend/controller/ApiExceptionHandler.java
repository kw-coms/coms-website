package com.coms.backend.controller;

import com.coms.backend.security.RequestBodyLimitFilter;
import io.sentry.Sentry;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.apache.catalina.connector.ClientAbortException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.server.ResponseStatusException;

import java.sql.SQLException;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatus(ResponseStatusException ex) {
        if (ex.getStatusCode().is5xxServerError()) {
            // A deliberate 5xx (storage failure, mail down) is still an operational problem; it
            // used to leave no trace at all because only the catch-all below logged.
            log.error("Request failed with {}: {}", ex.getStatusCode(), ex.getReason(), ex);
        }
        if (ex.getReason() == null) {
            // No intentional user-facing reason: send an empty body so the frontend applies its
            // own status-specific copy (e.g. the generic session-expired text for 401).
            return ResponseEntity.status(ex.getStatusCode()).build();
        }
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of("message", ex.getReason()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "입력값을 확인해주세요."));
    }

    /**
     * Malformed request input is the caller's fault, not a server fault. Without these, Spring MVC's
     * binding/parse exceptions fall through to the catch-all below and surface as HTTP 500 (with an
     * error-level stack trace and a Sentry event) — including Jackson 3's FAIL_ON_NULL_FOR_PRIMITIVES
     * throw on a missing/null primitive field. Map them to 400 with the same {message} body shape.
     *
     * <p>{@link ServletRequestBindingException} covers a missing query parameter, header, cookie or
     * path variable; the multipart pair covers a missing file part and an unparsable multipart body.
     */
    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class,
            ServletRequestBindingException.class,
            MissingServletRequestPartException.class,
            MultipartException.class,
            HandlerMethodValidationException.class,
            ConstraintViolationException.class
    })
    public ResponseEntity<Map<String, String>> handleBadRequest(HttpServletRequest request) {
        if (RequestBodyLimitFilter.exceeded(request)) {
            return bodyTooLarge();
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "입력값을 확인한 뒤 다시 시도해주세요."));
    }

    /**
     * A body sent without a declared length is cut off while it is being read, so the failure
     * arrives here as an unreadable message. It is the same refusal RequestBodyLimitFilter gives
     * when the length is declared, and gets the same answer.
     */
    private static ResponseEntity<Map<String, String>> bodyTooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("message", RequestBodyLimitFilter.MESSAGE));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleUploadTooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("message", "업로드 용량이 너무 큽니다. 파일 크기를 줄여 다시 시도해주세요."));
    }

    /** Wrong verb / body type / Accept header: answer with the status the client can act on. */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMethodNotAllowed() {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).build();
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleUnsupportedMediaType() {
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).build();
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<Map<String, String>> handleNotAcceptable() {
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE).build();
    }

    /**
     * A constraint the service did not check first. In practice that is two requests racing a
     * check-then-insert (a double-clicked vote or RSVP hitting a unique key) or a value longer than
     * its column — both the caller's to retry or fix, neither a server fault. Anything else that
     * the database refuses (a NOT NULL or CHECK violation) is a bug and stays a 500.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrity(DataIntegrityViolationException ex, HttpServletRequest request) {
        String sqlState = sqlStateOf(ex);
        if (sqlState != null && sqlState.startsWith("22")) {
            log.warn("Rejected a value the database could not store (sqlState={})", sqlState, ex);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "입력값이 너무 길거나 형식이 올바르지 않습니다."));
        }
        if ("23505".equals(sqlState) || "23503".equals(sqlState) || "23506".equals(sqlState)) {
            log.warn("Request conflicted with existing data (sqlState={})", sqlState, ex);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "이미 처리되었거나 다른 요청과 충돌했습니다. 새로고침 후 다시 시도해주세요."));
        }
        return handleUnexpected(ex, request);
    }

    /**
     * 메서드 단위 보안(@PreAuthorize)의 거부는 컨트롤러 안에서 던져지므로 이 advice 를
     * 먼저 통과한다 — 여기서 잡지 않으면 아래 catch-all 이 500 으로 바꿔 버린다.
     * URL 규칙에서 걸린 요청과 같은 응답(빈 본문 403/401)을 돌려준다.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDenied() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, String>> handleUnauthenticated() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    public ResponseEntity<Map<String, String>> handleNotFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    /**
     * The client went away mid-response (closed the tab during a download, navigated off). There is
     * nobody to answer and nothing wrong on our side, so this must not look like a server error.
     */
    @ExceptionHandler({ClientAbortException.class, AsyncRequestNotUsableException.class})
    public void handleClientAbort(Exception ex) {
        log.debug("Client disconnected before the response completed: {}", ex.toString());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex, HttpServletRequest request) {
        if (RequestBodyLimitFilter.exceeded(request)) {
            return bodyTooLarge();
        }
        log.error("Unhandled exception", ex);
        // Request failures never reached Sentry: SentryConfig only initialises the SDK, and this
        // handler swallows the exception before any uncaught-exception hook could see it.
        // A no-op while SENTRY_DSN is blank.
        Sentry.captureException(ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "요청 처리 중 오류가 발생했습니다."));
    }

    private static String sqlStateOf(Throwable ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sqlException && sqlException.getSQLState() != null) {
                return sqlException.getSQLState();
            }
            if (cause.getCause() == cause) {
                break;
            }
        }
        return null;
    }
}
