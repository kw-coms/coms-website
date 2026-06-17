package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record TeamRandomizerRoomSnapshotResponse(
        Integer version,
        String roomId,
        String roomName,
        String ownerStudentId,
        String ownerName,
        List<String> participants,
        Map<String, Object> profiles,
        List<String> roles,
        Map<String, Object> roleRules,
        Map<String, Object> fairness,
        List<Object> histories,
        LocalDateTime updatedAt
) {}
