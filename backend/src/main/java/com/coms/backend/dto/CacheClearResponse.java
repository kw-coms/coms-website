package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record CacheClearResponse(
        List<String> clearedCaches,
        int clearedCount,
        LocalDateTime clearedAt
) {}
