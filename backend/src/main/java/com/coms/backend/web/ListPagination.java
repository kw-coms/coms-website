package com.coms.backend.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;

/**
 * Helper for adding OPTIONAL, backward-compatible pagination to list endpoints that historically
 * returned a bare JSON array of every row.
 *
 * <p>Contract:
 * <ul>
 *   <li>When neither {@code page} nor {@code size} is supplied the full list is returned unchanged
 *       (a bare JSON array, identical to the legacy behaviour the frontend depends on).</li>
 *   <li>When pagination params are supplied the response is still a bare JSON array, but only the
 *       requested slice, plus an {@code X-Total-Count} header carrying the unpaged total so callers
 *       can compute the number of pages. The array shape is preserved so existing
 *       {@code Array.isArray(data) ? data : []} consumers keep working.</li>
 * </ul>
 *
 * <p>{@code page} is zero-based. If only one of the two params is supplied the other falls back to a
 * sane default ({@code page=0}, {@code size=20}).
 */
public final class ListPagination {

    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 200;

    private ListPagination() {
    }

    /**
     * Returns the full list as a bare array when no pagination params are present, otherwise a sliced
     * bare array with an {@code X-Total-Count} header.
     */
    public static <T> ResponseEntity<List<T>> paginate(List<T> all, Integer page, Integer size) {
        if (page == null && size == null) {
            return ResponseEntity.ok(all);
        }

        int resolvedPage = page == null ? 0 : page;
        int resolvedSize = size == null ? DEFAULT_SIZE : size;
        if (resolvedPage < 0 || resolvedSize < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page must be >= 0 and size must be >= 1.");
        }
        if (resolvedSize > MAX_SIZE) {
            resolvedSize = MAX_SIZE;
        }

        int total = all.size();
        int from = Math.min((long) resolvedPage * resolvedSize > Integer.MAX_VALUE
                ? Integer.MAX_VALUE
                : resolvedPage * resolvedSize, total);
        int to = Math.min(from + resolvedSize, total);
        List<T> slice = all.subList(from, to);

        return ResponseEntity.ok()
                .header("X-Total-Count", Integer.toString(total))
                .body(slice);
    }
}
