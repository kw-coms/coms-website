package com.coms.backend.repository;

import com.coms.backend.domain.ClubOfficer;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface ClubOfficerRepository extends JpaRepository<ClubOfficer, Long> {
    List<ClubOfficer> findAllByOrderByPositionAscIdAsc();
    List<ClubOfficer> findByTermIdOrderByPositionAscIdAsc(Long termId);
    List<ClubOfficer> findByTermIdIn(Collection<Long> termIds);
}
