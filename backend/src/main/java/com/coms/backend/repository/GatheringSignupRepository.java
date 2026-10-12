package com.coms.backend.repository;

import com.coms.backend.domain.GatheringSignup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface GatheringSignupRepository extends JpaRepository<GatheringSignup, Long> {
    List<GatheringSignup> findByGatheringIdOrderByCreatedAtAscIdAsc(Long gatheringId);

    List<GatheringSignup> findByGatheringIdIn(Collection<Long> gatheringIds);

    Optional<GatheringSignup> findByGatheringIdAndStudentId(Long gatheringId, String studentId);

    long countByGatheringId(Long gatheringId);

    void deleteByGatheringId(Long gatheringId);

    void deleteByGatheringIdAndStudentId(Long gatheringId, String studentId);

    void deleteByStudentId(String studentId);
}
