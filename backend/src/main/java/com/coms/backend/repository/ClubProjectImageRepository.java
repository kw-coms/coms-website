package com.coms.backend.repository;

import com.coms.backend.domain.ClubProjectImage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.coms.backend.domain.ClubProject;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ClubProjectImageRepository extends JpaRepository<ClubProjectImage, Long> {
    List<ClubProjectImage> findByClubProjectIdOrderByPositionAsc(Long projectId);
    List<ClubProjectImage> findByClubProjectIdInOrderByPositionAsc(Collection<Long> projectIds);
    void deleteByClubProjectId(Long projectId);

    @Query("select i from ClubProjectImage i, ClubProject p where i.id = :imageId and i.clubProjectId = p.id " +
            "and p.id = :projectId and (p.reviewStatus = :approved or :manager = true or p.ownerStudentId = :viewer)")
    Optional<ClubProjectImage> findVisible(@Param("projectId") Long projectId, @Param("imageId") Long imageId,
            @Param("approved") ClubProject.ReviewStatus approved, @Param("manager") boolean manager,
            @Param("viewer") String viewer);

    @Query("select i from ClubProjectImage i, ClubProject p where i.clubProjectId = p.id and p.id in :projectIds " +
            "and (p.reviewStatus = :approved or :manager = true or p.ownerStudentId = :viewer) " +
            "order by i.position asc, i.id asc")
    List<ClubProjectImage> findVisibleByProjectIds(@Param("projectIds") Collection<Long> projectIds,
            @Param("approved") ClubProject.ReviewStatus approved, @Param("manager") boolean manager,
            @Param("viewer") String viewer);
}
