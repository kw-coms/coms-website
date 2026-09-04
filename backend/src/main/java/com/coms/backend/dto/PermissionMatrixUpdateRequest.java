package com.coms.backend.dto;

import java.util.List;
import java.util.Map;

public record PermissionMatrixUpdateRequest(
        Map<String, List<String>> allowed
) {
}
