package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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

    @Autowired
    private MemberRepository memberRepository;

    @BeforeEach
    void setUp() {
        archiveFileRepository.deleteAll();
        memberRepository.deleteAll();
        saveMember("2026123456", "홍길동");
    }

    @Test
    void acceptsAllowedDocumentUpload() throws Exception {
        MockMultipartFile pdf = new MockMultipartFile(
                "file",
                "guide.pdf",
                "application/pdf",
                "%PDF-1.4".getBytes()
        );

        var response = archiveService.upload("강의 자료", "1주차 PDF", pdf, "2026123456");

        assertThat(response.title()).isEqualTo("강의 자료");
        assertThat(response.description()).isEqualTo("1주차 PDF");
        assertThat(response.originalName()).isEqualTo("guide.pdf");
        assertThat(response.fileSize()).isEqualTo(pdf.getSize());
        assertThat(response.uploaderName()).isEqualTo("홍길동");
        assertThat(response.category()).isEqualTo("GENERAL");
    }

    @Test
    void acceptsAcademicJournalCategory() throws Exception {
        MockMultipartFile pdf = new MockMultipartFile(
                "file",
                "journal.pdf",
                "application/pdf",
                "%PDF-1.4".getBytes()
        );

        var response = archiveService.upload("학술회지 1호", null, "ACADEMIC_JOURNAL", pdf, "2026123456");

        assertThat(response.category()).isEqualTo("ACADEMIC_JOURNAL");
    }

    @Test
    void rejectsHtmlUpload() {
        MockMultipartFile html = new MockMultipartFile(
                "file",
                "xss.html",
                "text/html",
                "<script>alert(1)</script>".getBytes()
        );

        assertThatThrownBy(() -> archiveService.upload("위험 파일", null, html, "2026123456"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rejectsInvalidCategory() {
        MockMultipartFile pdf = new MockMultipartFile(
                "file",
                "guide.pdf",
                "application/pdf",
                "%PDF-1.4".getBytes()
        );

        assertThatThrownBy(() -> archiveService.upload("강의 자료", null, "UNKNOWN", pdf, "2026123456"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getReason()).contains("Invalid archive category"));
    }

    @Test
    void rejectsOversizedUpload() {
        MockMultipartFile large = new MockMultipartFile(
                "file",
                "large.pdf",
                "application/pdf",
                "%PDF-1.4".getBytes()
        ) {
            @Override
            public long getSize() {
                return 50L * 1024 * 1024 + 1;
            }
        };

        assertThatThrownBy(() -> archiveService.upload("큰 파일", null, large, "2026123456"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getReason()).contains("50MB"));
    }

    private void saveMember(String studentId, String name) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@example.com");
        member.setPassword("encoded");
        member.setEmailVerified(true);
        memberRepository.save(member);
    }
}
