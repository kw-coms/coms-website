package com.coms.backend.service;

import com.coms.backend.dto.SponsorRequest;
import com.coms.backend.repository.SponsorImageRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:sponsor-image-retention-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/sponsor-image-retention"
})
@Transactional
class SponsorImageRetentionJobTest {

    private static final byte[] PNG_BYTES = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, (byte) 0x90, 0x77, 0x53,
            (byte) 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x78, (byte) 0x9C, 0x63, (byte) 0xF8,
            (byte) 0xCF, (byte) 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, (byte) 0xC9, (byte) 0xFE, (byte) 0x92,
            (byte) 0xEF, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, (byte) 0xAE, 0x42, 0x60, (byte) 0x82};

    @Autowired
    private SponsorImageRetentionJob job;

    @Autowired
    private SponsorService sponsorService;

    @Autowired
    private SponsorImageRepository imageRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Test
    void deletesOnlyUnreferencedSponsorImagesOlderThanTwentyFourHours() {
        Long oldOrphan = upload("old-orphan.png");
        Long youngOrphan = upload("young-orphan.png");
        Long sponsorLogo = upload("sponsor-logo.png");
        Long banner = upload("banner.png");
        Resource oldOrphanFile = sponsorService.loadImage(sponsorService.imageMeta(oldOrphan));

        sponsorService.create(new SponsorRequest("공개 후원", null, sponsorLogo, null, null,
                null, null, null, false, true, null));
        sponsorService.saveSettings(Map.of("bannerImageId", banner));
        entityManager.flush();
        Timestamp old = Timestamp.valueOf(LocalDateTime.now().minusHours(25));
        jdbcTemplate.update("UPDATE sponsor_images SET created_at = ? WHERE id IN (?, ?, ?)",
                old, oldOrphan, sponsorLogo, banner);
        entityManager.clear();

        // The job deletes each orphan in its own REQUIRES_NEW transaction, which runs on a
        // separate physical connection — it can only see fixture rows that are actually
        // committed, not merely flushed within this test's still-open transaction. Commit for
        // real, then reopen a transaction so the class's usual rollback-based cleanup still runs.
        TestTransaction.flagForCommit();
        TestTransaction.end();

        job.purgeOrphanedSponsorImages();

        TestTransaction.start();
        assertThat(imageRepository.findAll()).extracting("id")
                .containsExactlyInAnyOrder(youngOrphan, sponsorLogo, banner);
        assertThat(oldOrphanFile.exists()).isFalse();
    }

    private Long upload(String filename) {
        return sponsorService.uploadImage(new MockMultipartFile("image", filename, "image/png", PNG_BYTES)).id();
    }
}
