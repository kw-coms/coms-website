package com.coms.backend.repository;

import com.coms.backend.domain.HackathonMaterial;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface HackathonMaterialRepository extends JpaRepository<HackathonMaterial, Long> {
    List<HackathonMaterial> findByEventIdOrderByIdAsc(Long eventId);
    Optional<HackathonMaterial> findByEventIdAndId(Long eventId, Long id);
    long countByEventIdAndProjectId(Long eventId, String projectId);
    long countByEventIdAndProjectIdIsNull(Long eventId);
    boolean existsByEventIdAndProjectIdAndStoredNameIsNotNull(Long eventId, String projectId);
}
