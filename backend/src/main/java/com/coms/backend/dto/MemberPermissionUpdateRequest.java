package com.coms.backend.dto;

import java.util.Map;

public record MemberPermissionUpdateRequest(Map<String, String> overrides) {
}
