package com.coms.backend.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatus(ResponseStatusException ex) {
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
     */
    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class
    })
    public ResponseEntity<Map<String, String>> handleBadRequest() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "입력값을 확인한 뒤 다시 시도해주세요."));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleUploadTooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("message", "업로드 용량이 너무 큽니다. 파일 크기를 줄여 다시 시도해주세요."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "요청 처리 중 오류가 발생했습니다."));
    }
}
