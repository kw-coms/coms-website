package com.coms.backend.repository;

import com.coms.backend.domain.SponsorImage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SponsorImageRepository extends JpaRepository<SponsorImage, Long> {
    @Query("""
            SELECT image FROM SponsorImage image
            WHERE image.id = :id
              AND (image.id = :bannerImageId OR EXISTS (
                  SELECT sponsor.id FROM Sponsor sponsor
                  WHERE sponsor.logoImageId = image.id
                    AND sponsor.visible = true
                    AND sponsor.anonymous = false
                    AND (sponsor.untilDate IS NULL OR sponsor.untilDate >= :today)
              ))
            """)
    Optional<SponsorImage> findPublicById(@Param("id") Long id,
                                          @Param("bannerImageId") Long bannerImageId,
                                          @Param("today") LocalDate today);

    @Query("""
            SELECT image FROM SponsorImage image
            WHERE image.createdAt < :cutoff
              AND (:bannerImageId IS NULL OR image.id <> :bannerImageId)
              AND NOT EXISTS (
                  SELECT sponsor.id FROM Sponsor sponsor WHERE sponsor.logoImageId = image.id
              )
            """)
    List<SponsorImage> findOrphanedOlderThan(@Param("cutoff") LocalDateTime cutoff,
                                             @Param("bannerImageId") Long bannerImageId);
}
