package com.coms.backend.repository;

import com.coms.backend.domain.TeamRandomizerRoom;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TeamRandomizerRoomRepository extends JpaRepository<TeamRandomizerRoom, Long> {
    Optional<TeamRandomizerRoom> findByOwnerStudentIdAndRoomId(String ownerStudentId, String roomId);

    void deleteByOwnerStudentId(String ownerStudentId);
}
