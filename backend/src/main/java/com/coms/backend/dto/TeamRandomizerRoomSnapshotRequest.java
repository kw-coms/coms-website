package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

public record TeamRandomizerRoomSnapshotRequest(
        Integer version,
        @NotBlank @Size(max = 120) String roomId,
        @NotBlank @Size(max = 100) String roomName,
        @Size(max = 50) String ownerStudentId,
        @Size(max = 100) String ownerName,
        List<String> participants,
        Map<String, Object> profiles,
        List<String> roles,
        Map<String, Object> roleRules,
        Map<String, Object> fairness,
        List<Object> histories
) {}
