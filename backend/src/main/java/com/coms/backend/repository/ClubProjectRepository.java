package com.coms.backend.repository;

import com.coms.backend.domain.ClubProject;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface ClubProjectRepository extends JpaRepository<ClubProject, Long> {
    List<ClubProject> findAllByOrderByPositionAscIdAsc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from ClubProject p where p.id = :id")
    Optional<ClubProject> findWithLockById(@Param("id") Long id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ClubProject p set p.viewCount = p.viewCount + 1 where p.id = :id")
    int incrementViewCount(@Param("id") Long id);

    @Modifying(flushAutomatically = true)
    @Query("update ClubProject p set p.ownerStudentId = null where p.ownerStudentId = :studentId")
    void detachOwnedWorks(@Param("studentId") String studentId);

    long countByCategory(String category);

    @Query("SELECT p.category AS category, COUNT(p) AS total FROM ClubProject p GROUP BY p.category")
    List<Object[]> countByCategory();
}
