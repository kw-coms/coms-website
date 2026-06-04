package com.coms.backend.service;

import com.coms.backend.repository.ArchiveFileRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:archive-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/archive-service"
})
@Transactional
class ArchiveServiceTest {

    @Autowired
    private ArchiveService archiveService;

    @Autowired
    private ArchiveFileRepository archiveFileRepository;

    @BeforeEach
    void setUp() {
        archiveFileRepository.deleteAll();
    }

    @Test
    void acceptsAllowedDocumentUpload() throws Exception {
        MockMultipartFile pdf = new MockMultipartFile(
                "file",
                "guide.pdf",
                "application/pdf",
                "%PDF-1.4".getBytes()
        );

        var response = archiveService.upload(pdf, "2026123456");

        assertThat(response.originalName()).isEqualTo("guide.pdf");
        assertThat(response.fileSize()).isEqualTo(pdf.getSize());
    }

    @Test
    void rejectsHtmlUpload() {
        MockMultipartFile html = new MockMultipartFile(
                "file",
                "xss.html",
                "text/html",
                "<script>alert(1)</script>".getBytes()
        );

        assertThatThrownBy(() -> archiveService.upload(html, "2026123456"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rejectsOversizedUpload() {
        MockMultipartFile large = new MockMultipartFile(
                "file",
                "large.pdf",
                "application/pdf",
                new byte[20 * 1024 * 1024 + 1]
        );

        assertThatThrownBy(() -> archiveService.upload(large, "2026123456"))
                .isInstanceOf(ResponseStatusException.class);
    }
}
