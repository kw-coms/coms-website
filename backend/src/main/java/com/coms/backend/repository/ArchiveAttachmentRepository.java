package com.coms.backend.repository;

import com.coms.backend.domain.ArchiveAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ArchiveAttachmentRepository extends JpaRepository<ArchiveAttachment, Long> {
    List<ArchiveAttachment> findByArchiveFileIdOrderByPositionAsc(Long archiveFileId);
    List<ArchiveAttachment> findByArchiveFileIdInOrderByPositionAsc(Collection<Long> archiveFileIds);
    Optional<ArchiveAttachment> findByIdAndArchiveFileId(Long id, Long archiveFileId);
}
