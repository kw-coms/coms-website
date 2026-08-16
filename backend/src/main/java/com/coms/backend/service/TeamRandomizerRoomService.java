package com.coms.backend.service;

import com.coms.backend.domain.TeamRandomizerRoom;
import com.coms.backend.dto.TeamRandomizerRoomSnapshotRequest;
import com.coms.backend.dto.TeamRandomizerRoomSnapshotResponse;
import com.coms.backend.repository.TeamRandomizerRoomRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@Service
@Transactional
public class TeamRandomizerRoomService {
    private static final int MAX_ITEMS = 300;

    private final TeamRandomizerRoomRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TeamRandomizerRoomService(TeamRandomizerRoomRepository repository) {
        this.repository = repository;
    }

    public TeamRandomizerRoomSnapshotResponse saveSnapshot(String ownerStudentId, String pathRoomId, TeamRandomizerRoomSnapshotRequest request) {
        String owner = requireOwner(ownerStudentId);
        String roomId = clean(request.roomId());
        if (!roomId.equals(clean(pathRoomId))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "roomId mismatch");
        }

        TeamRandomizerRoom room = repository.findByOwnerStudentIdAndRoomId(owner, roomId)
                .orElseGet(TeamRandomizerRoom::new);
        room.setOwnerStudentId(owner);
        room.setRoomId(roomId);
        room.setRoomName(clean(request.roomName()));
        room.setOwnerName(clean(request.ownerName()).isBlank() ? owner : clean(request.ownerName()));
        room.setVersion(request.version() == null || request.version() < 1 ? 1 : request.version());
        room.setParticipantsJson(writeList(limitStrings(request.participants())));
        room.setProfilesJson(writeMap(request.profiles()));
        room.setRolesJson(writeList(limitStrings(request.roles())));
        room.setRoleRulesJson(writeMap(request.roleRules()));
        room.setFairnessJson(writeMap(request.fairness()));
        room.setHistoriesJson(writeList(limitObjects(request.histories())));
        return toResponse(repository.save(room));
    }

    @Transactional(readOnly = true)
    public TeamRandomizerRoomSnapshotResponse getSnapshot(String ownerStudentId, String roomId) {
        String owner = requireOwner(ownerStudentId);
        return repository.findByOwnerStudentIdAndRoomId(owner, clean(roomId))
                .map(this::toResponse)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "TeamMate room snapshot not found"));
    }

    private TeamRandomizerRoomSnapshotResponse toResponse(TeamRandomizerRoom room) {
        return new TeamRandomizerRoomSnapshotResponse(
                room.getVersion(),
                room.getRoomId(),
                room.getRoomName(),
                room.getOwnerStudentId(),
                room.getOwnerName(),
                readStringList(room.getParticipantsJson()),
                readMap(room.getProfilesJson()),
                readStringList(room.getRolesJson()),
                readMap(room.getRoleRulesJson()),
                readMap(room.getFairnessJson()),
                readObjectList(room.getHistoriesJson()),
                room.getUpdatedAt()
        );
    }

    private String requireOwner(String ownerStudentId) {
        String owner = clean(ownerStudentId);
        if (owner.isBlank()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return owner;
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static List<String> limitStrings(List<String> values) {
        return (values == null ? List.<String>of() : values).stream()
                .map(TeamRandomizerRoomService::clean)
                .filter(value -> !value.isBlank())
                .limit(MAX_ITEMS)
                .toList();
    }

    private static List<Object> limitObjects(List<Object> values) {
        return (values == null ? List.<Object>of() : values).stream().limit(MAX_ITEMS).toList();
    }

    private String writeList(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? List.of() : value);
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid snapshot list");
        }
    }

    private String writeMap(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value == null ? Map.of() : value);
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid snapshot object");
        }
    }

    private List<String> readStringList(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception exception) {
            return List.of();
        }
    }

    private List<Object> readObjectList(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<Object>>() {});
        } catch (Exception exception) {
            return List.of();
        }
    }

    private Map<String, Object> readMap(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception exception) {
            return Map.of();
        }
    }
}
