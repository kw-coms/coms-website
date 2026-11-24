package com.coms.backend.repository;

import com.coms.backend.domain.ClubProjectFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.coms.backend.domain.ClubProject;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ClubProjectFileRepository extends JpaRepository<ClubProjectFile, Long> {
    List<ClubProjectFile> findByClubProjectIdOrderByPositionAsc(Long clubProjectId);
    List<ClubProjectFile> findByClubProjectIdInOrderByPositionAsc(Collection<Long> clubProjectIds);
    void deleteByClubProjectId(Long clubProjectId);

    @Query("select f from ClubProjectFile f, ClubProject p where f.id = :fileId and f.clubProjectId = p.id " +
            "and p.id = :projectId and (p.reviewStatus = :approved or :manager = true or p.ownerStudentId = :viewer)")
    Optional<ClubProjectFile> findVisible(@Param("projectId") Long projectId, @Param("fileId") Long fileId,
            @Param("approved") ClubProject.ReviewStatus approved, @Param("manager") boolean manager,
            @Param("viewer") String viewer);

    @Query("select f from ClubProjectFile f, ClubProject p where f.clubProjectId = p.id and p.id in :projectIds " +
            "and (p.reviewStatus = :approved or :manager = true or p.ownerStudentId = :viewer) " +
            "order by f.position asc, f.id asc")
    List<ClubProjectFile> findVisibleByProjectIds(@Param("projectIds") Collection<Long> projectIds,
            @Param("approved") ClubProject.ReviewStatus approved, @Param("manager") boolean manager,
            @Param("viewer") String viewer);
}
