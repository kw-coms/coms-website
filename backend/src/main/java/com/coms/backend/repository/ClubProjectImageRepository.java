package com.coms.backend.repository;

import com.coms.backend.domain.ClubProjectImage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface ClubProjectImageRepository extends JpaRepository<ClubProjectImage, Long> {
    List<ClubProjectImage> findByClubProjectIdOrderByPositionAsc(Long projectId);
    List<ClubProjectImage> findByClubProjectIdInOrderByPositionAsc(Collection<Long> projectIds);
    void deleteByClubProjectId(Long projectId);
}
