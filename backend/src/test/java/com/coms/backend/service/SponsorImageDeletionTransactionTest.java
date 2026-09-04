package com.coms.backend.service;

import com.coms.backend.repository.SponsorImageRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@code deleteImage()} (and, by the same {@code SponsorImageDeleter} mechanism, {@code delete()},
 * {@code update()}'s logo replace and {@code saveSettings()}'s banner replace) must not unlink the
 * stored file until the surrounding transaction actually commits — otherwise a rollback leaves the
 * {@code sponsor_images} row pointing at a file that is already gone.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:sponsor-image-deletion-txn-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/sponsor-image-deletion-txn"
})
class SponsorImageDeletionTransactionTest {

    private static final byte[] PNG_BYTES = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, (byte) 0x90, 0x77, 0x53,
            (byte) 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x78, (byte) 0x9C, 0x63, (byte) 0xF8,
            (byte) 0xCF, (byte) 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, (byte) 0xC9, (byte) 0xFE, (byte) 0x92,
            (byte) 0xEF, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, (byte) 0xAE, 0x42, 0x60, (byte) 0x82};

    @Autowired
    private SponsorService sponsorService;

    @Autowired
    private SponsorImageRepository imageRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void rolledBackDeleteLeavesTheFileOnDisk() {
        Long imageId = upload("rollback-me.png");
        Resource file = sponsorService.loadImage(sponsorService.imageMeta(imageId));
        assertThat(file.exists()).isTrue();

        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            sponsorService.deleteImage(imageId);
            throw new RuntimeException("force rollback after the row delete");
        })).hasMessage("force rollback after the row delete");

        assertThat(imageRepository.existsById(imageId)).isTrue();
        assertThat(file.exists()).isTrue();
    }

    @Test
    void committedDeleteRemovesTheFile() {
        Long imageId = upload("commit-me.png");
        Resource file = sponsorService.loadImage(sponsorService.imageMeta(imageId));
        assertThat(file.exists()).isTrue();

        sponsorService.deleteImage(imageId);

        assertThat(imageRepository.existsById(imageId)).isFalse();
        assertThat(file.exists()).isFalse();
    }

    private Long upload(String filename) {
        return sponsorService.uploadImage(new MockMultipartFile("image", filename, "image/png", PNG_BYTES)).id();
    }
}
