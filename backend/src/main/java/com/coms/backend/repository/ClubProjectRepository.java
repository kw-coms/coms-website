package com.coms.backend.repository;

import com.coms.backend.domain.ClubProject;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ClubProjectRepository extends JpaRepository<ClubProject, Long> {
    List<ClubProject> findAllByOrderByPositionAscIdAsc();

    long countByCategory(String category);

    @Query("SELECT p.category AS category, COUNT(p) AS total FROM ClubProject p GROUP BY p.category")
    List<Object[]> countByCategory();
}
