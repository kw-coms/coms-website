package com.coms.backend.service;

import com.coms.backend.dto.TeamRandomizerRoomSnapshotRequest;
import com.coms.backend.dto.TeamRandomizerRoomSnapshotResponse;
import com.coms.backend.repository.TeamRandomizerRoomRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:team-randomizer-room-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "mail.enabled=false",
        "integration.hmac-secret=unit-test-secret-1234567890-abcdef"
})
class TeamRandomizerRoomServiceTest {
    @Autowired
    private TeamRandomizerRoomService service;

    @Autowired
    private TeamRandomizerRoomRepository repository;

    @BeforeEach
    void setUp() {
        repository.deleteAll();
    }

    @Test
    void storesAndReturnsRoomSnapshotForOwner() {
        TeamRandomizerRoomSnapshotResponse saved = service.saveSnapshot("20250001", "room-a", sampleRequest());

        assertThat(saved.roomId()).isEqualTo("room-a");
        assertThat(saved.roomName()).isEqualTo("캡스톤 팀");
        assertThat(saved.ownerStudentId()).isEqualTo("20250001");
        assertThat(saved.participants()).containsExactly("홍길동 (20250001)", "김민수");
        assertThat(saved.profiles()).containsEntry("김민수", Map.of("major", "컴퓨터공학"));

        TeamRandomizerRoomSnapshotResponse loaded = service.getSnapshot("20250001", "room-a");
        assertThat(loaded.roles()).containsExactly("발표자", "서기");
        assertThat(loaded.updatedAt()).isNotNull();
    }

    @Test
    void blocksOtherUsersFromReadingOwnerRoom() {
        service.saveSnapshot("20250001", "room-a", sampleRequest());

        assertThatThrownBy(() -> service.getSnapshot("20259999", "room-a"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void requiresPathRoomIdToMatchPayloadRoomId() {
        TeamRandomizerRoomSnapshotRequest mismatch = new TeamRandomizerRoomSnapshotRequest(
                1,
                "room-b",
                "다른 방",
                "20250001",
                "홍길동",
                List.of("홍길동"),
                Map.of(),
                List.of("발표자"),
                Map.of(),
                Map.of(),
                List.of()
        );

        assertThatThrownBy(() -> service.saveSnapshot("20250001", "room-a", mismatch))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    private TeamRandomizerRoomSnapshotRequest sampleRequest() {
        return new TeamRandomizerRoomSnapshotRequest(
                1,
                "room-a",
                "캡스톤 팀",
                "20259999",
                "다른 이름",
                List.of("홍길동 (20250001)", "김민수"),
                Map.of("김민수", Map.of("major", "컴퓨터공학")),
                List.of("발표자", "서기"),
                Map.of("김민수", Map.of("fixed", "발표자")),
                Map.of("avoidPairs", List.of(List.of("홍길동 (20250001)", "김민수"))),
                List.of(Map.of("id", "h1", "teams", List.of()))
        );
    }
}
