package com.coms.backend.controller;

import com.coms.backend.dto.TeamRandomizerRoomSnapshotRequest;
import com.coms.backend.dto.TeamRandomizerRoomSnapshotResponse;
import com.coms.backend.service.TeamRandomizerRoomService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/team-randomizer/rooms")
public class TeamRandomizerRoomController {
    private final TeamRandomizerRoomService service;

    public TeamRandomizerRoomController(TeamRandomizerRoomService service) {
        this.service = service;
    }

    @PutMapping("/{roomId}")
    public ResponseEntity<TeamRandomizerRoomSnapshotResponse> save(Authentication authentication,
                                                                   @RequestHeader(value = "X-Requested-With", required = false) String requestedWith,
                                                                   @PathVariable String roomId,
                                                                   @Valid @RequestBody TeamRandomizerRoomSnapshotRequest request) {
        requireXmlHttpRequest(requestedWith);
        return ResponseEntity.ok(service.saveSnapshot(authentication.getName(), roomId, request));
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<TeamRandomizerRoomSnapshotResponse> get(Authentication authentication,
                                                                  @RequestHeader(value = "X-Requested-With", required = false) String requestedWith,
                                                                  @PathVariable String roomId) {
        requireXmlHttpRequest(requestedWith);
        return ResponseEntity.ok(service.getSnapshot(authentication.getName(), roomId));
    }

    private void requireXmlHttpRequest(String requestedWith) {
        if (requestedWith == null || !"XMLHttpRequest".equalsIgnoreCase(requestedWith)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "X-Requested-With required");
        }
    }
}
