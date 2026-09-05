package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * {@code expectedUpdatedAt} is the {@code updatedAt} the client last read from
 * {@link PermissionMatrixResponse} (null if the matrix has never been saved). It is required, not
 * optional, so every write goes through the optimistic-concurrency check in
 * {@code PermissionService.replace()} — a client that skips it can't silently clobber a
 * concurrent admin's save.
 */
public record PermissionMatrixUpdateRequest(
        Map<String, List<String>> allowed,
        LocalDateTime expectedUpdatedAt
) {
}
