package com.coms.backend.dto;

import java.util.List;

public record ArchiveVisibilityUpdateRequest(String visibility, List<String> selectedStudentIds) {}
