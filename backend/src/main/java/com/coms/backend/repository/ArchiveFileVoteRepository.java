package com.coms.backend.repository;

import com.coms.backend.domain.ArchiveFileVote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ArchiveFileVoteRepository extends JpaRepository<ArchiveFileVote, Long> {
    List<ArchiveFileVote> findByArchiveFileIdIn(Collection<Long> archiveFileIds);
    Optional<ArchiveFileVote> findByArchiveFileIdAndStudentId(Long archiveFileId, String studentId);
    void deleteByStudentId(String studentId);
}
