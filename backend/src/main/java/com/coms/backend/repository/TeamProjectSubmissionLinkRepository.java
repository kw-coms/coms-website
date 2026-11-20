package com.coms.backend.repository;

import com.coms.backend.domain.TeamProjectSubmissionLink;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface TeamProjectSubmissionLinkRepository extends JpaRepository<TeamProjectSubmissionLink, Long> {
    List<TeamProjectSubmissionLink> findBySubmissionIdInOrderByPositionAscIdAsc(Collection<Long> submissionIds);
    void deleteBySubmissionId(Long submissionId);
    void deleteBySubmissionIdIn(Collection<Long> submissionIds);
}
