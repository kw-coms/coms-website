package com.coms.backend.repository;

import com.coms.backend.domain.ClubOfficerTerm;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ClubOfficerTermRepository extends JpaRepository<ClubOfficerTerm, Long> {
    List<ClubOfficerTerm> findAllByOrderByYearDescPositionDescIdDesc();
    List<ClubOfficerTerm> findByYear(int year);
    Optional<ClubOfficerTerm> findByLabel(String label);
}
