package com.coms.backend.repository;

import com.coms.backend.domain.ArchiveFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArchiveFileRepository extends JpaRepository<ArchiveFile, Long> {
    List<ArchiveFile> findAllByOrderByUploadedAtDesc();
}
