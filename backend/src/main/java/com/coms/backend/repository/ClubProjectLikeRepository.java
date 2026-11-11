package com.coms.backend.repository;

import com.coms.backend.domain.ClubProjectLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ClubProjectLikeRepository extends JpaRepository<ClubProjectLike, Long> {
    Optional<ClubProjectLike> findByClubProjectIdAndStudentId(Long clubProjectId, String studentId);
    long countByClubProjectId(Long clubProjectId);
    void deleteByStudentId(String studentId);

    @Modifying(flushAutomatically = true)
    @Query("delete from ClubProjectLike l where l.clubProjectId = :projectId")
    void deleteByClubProjectId(@Param("projectId") Long projectId);

    @Query("select l.clubProjectId as projectId, count(l) as total from ClubProjectLike l "
            + "where l.clubProjectId in :projectIds group by l.clubProjectId")
    List<LikeCount> countByProjectIds(@Param("projectIds") Collection<Long> projectIds);

    @Query("select l.clubProjectId from ClubProjectLike l where l.clubProjectId in :projectIds "
            + "and l.studentId = :studentId")
    List<Long> findLikedProjectIds(@Param("projectIds") Collection<Long> projectIds,
                                   @Param("studentId") String studentId);

    interface LikeCount {
        Long getProjectId();
        long getTotal();
    }
}
