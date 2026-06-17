package com.coms.backend.controller;

import com.coms.backend.dto.TeamRandomizerRoomSnapshotRequest;
import com.coms.backend.dto.TeamRandomizerRoomSnapshotResponse;
import com.coms.backend.service.TeamRandomizerRoomService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TeamRandomizerRoomControllerTest {
    private final TeamRandomizerRoomService service = mock(TeamRandomizerRoomService.class);
    private final TeamRandomizerRoomController controller = new TeamRandomizerRoomController(service);
    private final TestingAuthenticationToken auth = new TestingAuthenticationToken("20250001", "password");

    @Test
    void savesSnapshotForAuthenticatedStudent() {
        TeamRandomizerRoomSnapshotRequest request = sampleRequest();
        TeamRandomizerRoomSnapshotResponse response = sampleResponse();
        when(service.saveSnapshot("20250001", "room-a", request)).thenReturn(response);

        var result = controller.save(auth, "XMLHttpRequest", "room-a", request);

        assertThat(result.getBody()).isEqualTo(response);
        verify(service).saveSnapshot("20250001", "room-a", request);
    }

    @Test
    void readsSnapshotForAuthenticatedStudent() {
        TeamRandomizerRoomSnapshotResponse response = sampleResponse();
        when(service.getSnapshot("20250001", "room-a")).thenReturn(response);

        var result = controller.get(auth, "XMLHttpRequest", "room-a");

        assertThat(result.getBody()).isEqualTo(response);
        verify(service).getSnapshot("20250001", "room-a");
    }

    @Test
    void rejectsRequestsWithoutAjaxHeader() {
        assertThatThrownBy(() -> controller.get(auth, null, "room-a"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    private TeamRandomizerRoomSnapshotRequest sampleRequest() {
        return new TeamRandomizerRoomSnapshotRequest(
                1,
                "room-a",
                "캡스톤 팀",
                "20250001",
                "홍길동",
                List.of("홍길동"),
                Map.of(),
                List.of("발표자"),
                Map.of(),
                Map.of(),
                List.of()
        );
    }

    private TeamRandomizerRoomSnapshotResponse sampleResponse() {
        return new TeamRandomizerRoomSnapshotResponse(
                1,
                "room-a",
                "캡스톤 팀",
                "20250001",
                "홍길동",
                List.of("홍길동"),
                Map.of(),
                List.of("발표자"),
                Map.of(),
                Map.of(),
                List.of(),
                LocalDateTime.now()
        );
    }
}
