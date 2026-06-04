package com.coms.backend.dto;

import java.time.LocalDateTime;

public record BannedStudentResponse(Long id, String studentId, LocalDateTime bannedAt) {}
