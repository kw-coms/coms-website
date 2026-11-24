package com.coms.backend.repository;

import com.coms.backend.domain.StudySession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface StudySessionRepository extends JpaRepository<StudySession, Long> {
    List<StudySession> findByGroupIdOrderByRoundNoAsc(Long groupId);
    Optional<StudySession> findByIdAndGroupId(Long id, Long groupId);
    Optional<StudySession> findTopByGroupIdOrderByRoundNoDesc(Long groupId);

    @Query("select s.groupId from StudySession s where s.id = :id")
    Optional<Long> findGroupIdById(@Param("id") Long id);
}
