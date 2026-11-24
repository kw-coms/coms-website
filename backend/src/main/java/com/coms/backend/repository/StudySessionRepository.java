package com.coms.backend.repository;

import com.coms.backend.domain.StudySession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface StudySessionRepository extends JpaRepository<StudySession, Long> {
    List<StudySession> findByGroupIdOrderByRoundNoAsc(Long groupId);
    Optional<StudySession> findByIdAndGroupId(Long id, Long groupId);
    Optional<StudySession> findTopByGroupIdOrderByRoundNoDesc(Long groupId);
}
