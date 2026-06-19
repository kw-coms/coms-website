package com.coms.backend.repository;

import com.coms.backend.domain.ClubProjectFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ClubProjectFileRepository extends JpaRepository<ClubProjectFile, Long> {
    List<ClubProjectFile> findByClubProjectIdOrderByPositionAsc(Long clubProjectId);
    List<ClubProjectFile> findByClubProjectIdInOrderByPositionAsc(Collection<Long> clubProjectIds);
    void deleteByClubProjectId(Long clubProjectId);
}
