package com.coms.backend.repository;

import com.coms.backend.domain.MiniAppDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MiniAppDocumentRepository extends JpaRepository<MiniAppDocument, Long> {
    Optional<MiniAppDocument> findByAppAndContentTypeAndOwnerStudentIdAndContentId(String app, String contentType, String ownerStudentId, String contentId);

    Optional<MiniAppDocument> findByAppAndShareSlugAndSharedTrue(String app, String shareSlug);

    boolean existsByShareSlug(String shareSlug);

    List<MiniAppDocument> findByAppAndOwnerStudentIdOrderByUpdatedAtDesc(String app, String ownerStudentId);

    List<MiniAppDocument> findTop100ByAppAndSharedTrueOrderBySharedAtDesc(String app);
}
