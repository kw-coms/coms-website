package com.coms.backend.repository;

import com.coms.backend.domain.TeamProjectSubmissionFile;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TeamProjectSubmissionFileRepository extends JpaRepository<TeamProjectSubmissionFile, Long> {
    List<TeamProjectSubmissionFile> findBySubmissionIdInOrderByIdAsc(Collection<Long> submissionIds);
    Optional<TeamProjectSubmissionFile> findByIdAndSubmissionId(Long id, Long submissionId);
}
