package com.coms.backend.repository;

import com.coms.backend.domain.ClubProjectComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ClubProjectCommentRepository extends JpaRepository<ClubProjectComment, Long> {
    List<ClubProjectComment> findByClubProjectIdOrderByCreatedAtAscIdAsc(Long clubProjectId);
    long countByClubProjectId(Long clubProjectId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ClubProjectComment c where c.id = :commentId")
    void deleteTree(@Param("commentId") Long commentId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ClubProjectComment c where c.studentId = :studentId")
    void deleteByStudentId(@Param("studentId") String studentId);

    @Modifying(flushAutomatically = true)
    @Query("delete from ClubProjectComment c where c.clubProjectId = :projectId")
    void deleteByClubProjectId(@Param("projectId") Long projectId);

    @Query("select c.clubProjectId as projectId, count(c) as total from ClubProjectComment c "
            + "where c.clubProjectId in :projectIds group by c.clubProjectId")
    List<CommentCount> countByProjectIds(@Param("projectIds") Collection<Long> projectIds);

    interface CommentCount {
        Long getProjectId();
        long getTotal();
    }
}
