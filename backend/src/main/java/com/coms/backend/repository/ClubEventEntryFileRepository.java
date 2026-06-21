package com.coms.backend.repository;

import com.coms.backend.domain.ClubEventEntryFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ClubEventEntryFileRepository extends JpaRepository<ClubEventEntryFile, Long> {
    List<ClubEventEntryFile> findByEntryIdOrderByPositionAsc(Long entryId);
    List<ClubEventEntryFile> findByEntryIdInOrderByPositionAsc(Collection<Long> entryIds);
    void deleteByEntryId(Long entryId);
    void deleteByEntryIdIn(Collection<Long> entryIds);
}
