package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.ArchiveFileVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.atomic.AtomicReference;

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
    private ArchiveFileVoteRepository archiveFileVoteRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private StorageService storageService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        auditLogRepository.deleteAll();
        archiveFileVoteRepository.deleteAll();
        archiveFileRepository.deleteAll();
        memberRepository.deleteAll();
        auditLogRepository.flush();
        archiveFileVoteRepository.flush();
        archiveFileRepository.flush();
        memberRepository.flush();
        saveMember("2026123456", "홍길동", Member.Role.USER);
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

    @Test
    void ownerCanEditMetadataAndReplaceFileWhilePreservingIdentityAndEngagement() throws Exception {
        saveMember("2026000001", "투표자", Member.Role.USER);
        var created = archiveService.upload("원제목", "원설명", "GENERAL", pdf("old.pdf", "%PDF-1.4 old"), "2026123456");
        archiveService.vote("2026000001", created.id(), 1);
        archiveService.getAndIncrementView(created.id(), "2026123456");

        var updated = archiveService.update("2026123456", created.id(), "새제목", "새설명", "ACADEMIC_JOURNAL",
                pdf("new.pdf", "%PDF-1.4 new"));

        assertThat(updated.id()).isEqualTo(created.id());
        assertThat(updated.uploadedBy()).isEqualTo("2026123456");
        assertThat(updated.uploaderName()).isEqualTo("홍길동");
        assertThat(updated.uploadedAt()).isEqualTo(created.uploadedAt());
        assertThat(updated.title()).isEqualTo("새제목");
        assertThat(updated.description()).isEqualTo("새설명");
        assertThat(updated.category()).isEqualTo("ACADEMIC_JOURNAL");
        assertThat(updated.originalName()).isEqualTo("new.pdf");
        assertThat(updated.viewCount()).isEqualTo(1);
        assertThat(updated.upvotes()).isEqualTo(1);
        assertThat(updated.contentVersion()).isNotBlank();
        assertThat(updated.contentVersion()).isNotEqualTo(created.contentVersion());
        assertThat(auditLogRepository.findAll()).anySatisfy(log -> {
            assertThat(log.getAction()).isEqualTo("ARCHIVE_FILE_UPDATE");
            assertThat(log.getActorStudentId()).isEqualTo("2026123456");
            assertThat(log.getTargetId()).isEqualTo(String.valueOf(created.id()));
        });
    }

    @Test
    void adminCanEditAnotherMembersArchiveButVicePresidentCannot() throws Exception {
        saveMember("2026000001", "회장", Member.Role.ADMIN);
        saveMember("2026000002", "부회장", Member.Role.VICE_PRESIDENT);
        var created = archiveService.upload("원제목", null, pdf("old.pdf", "%PDF-1.4 old"), "2026123456");

        var adminEdit = archiveService.update("2026000001", created.id(), "회장수정", null, "GENERAL", null);
        assertThat(adminEdit.title()).isEqualTo("회장수정");

        assertThatThrownBy(() -> archiveService.update("2026000002", created.id(), "부회장수정", null, "GENERAL", null))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode().value()).isEqualTo(403));
    }

    @Test
    void updateRejectsTooLongTitleBeforeReplacingStoredFile() throws Exception {
        var created = archiveService.upload("원제목", null, pdf("old.pdf", "%PDF-1.4 old"), "2026123456");
        String oldStoredName = archiveFileRepository.findById(created.id()).orElseThrow().getStoredName();

        assertThatThrownBy(() -> archiveService.update(
                "2026123456",
                created.id(),
                "가".repeat(201),
                null,
                "GENERAL",
                pdf("new.pdf", "%PDF-1.4 new")
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getStatusCode().value()).isEqualTo(400));

        assertThat(archiveFileRepository.findById(created.id()).orElseThrow().getStoredName()).isEqualTo(oldStoredName);
    }

    @Test
    void updateRejectsEmptySelectedReplacementFile() throws Exception {
        var created = archiveService.upload("원제목", null, pdf("old.pdf", "%PDF-1.4 old"), "2026123456");

        assertThatThrownBy(() -> archiveService.update(
                "2026123456",
                created.id(),
                "새제목",
                null,
                "GENERAL",
                new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0])
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
            assertThat(ex.getStatusCode().value()).isEqualTo(400);
            assertThat(ex.getReason()).contains("비어");
        });
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void rolledBackReplacementKeepsOldFileAndDeletesNewFile() throws Exception {
        var created = archiveService.upload("원제목", null, pdf("old.pdf", "%PDF-1.4 old"), "2026123456");
        String oldStoredName = archiveFileRepository.findById(created.id()).orElseThrow().getStoredName();
        Resource oldResource = storageService.load(oldStoredName);
        AtomicReference<String> newStoredName = new AtomicReference<>();

        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            try {
                archiveService.update("2026123456", created.id(), "새제목", null, "GENERAL", pdf("new.pdf", "%PDF-1.4 new"));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
            newStoredName.set(archiveFileRepository.findById(created.id()).orElseThrow().getStoredName());
            throw new RuntimeException("force rollback after replacement");
        })).hasMessage("force rollback after replacement");

        assertThat(archiveFileRepository.findById(created.id()).orElseThrow().getStoredName()).isEqualTo(oldStoredName);
        assertThat(oldResource.exists()).isTrue();
        assertThatThrownBy(() -> storageService.load(newStoredName.get())).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void authorDisplayNameUpdatePreservesOwnerButStudentIdReassignmentChangesOwnerForAdminOnly() throws Exception {
        saveMember("2026000001", "회장", Member.Role.ADMIN);
        saveMember("2026000002", "새주인", Member.Role.USER);
        saveMember("2026000003", "부회장", Member.Role.VICE_PRESIDENT);
        var created = archiveService.upload("원제목", null, pdf("old.pdf", "%PDF-1.4 old"), "2026123456");

        authenticate("2026000003", "ROLE_VICE_PRESIDENT");
        var displayOnly = archiveService.updateAuthor(created.id(), "표시작성자", null, "2026000003");
        assertThat(displayOnly.uploadedBy()).isEqualTo("2026123456");
        assertThat(displayOnly.uploaderName()).isEqualTo("표시작성자");

        assertThatThrownBy(() -> archiveService.updateAuthor(created.id(), null, "2026000002", "2026000003"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode().value()).isEqualTo(403));

        authenticate("2026000001", "ROLE_ADMIN");
        var reassigned = archiveService.updateAuthor(created.id(), null, "2026000002", "2026000001");
        assertThat(reassigned.uploadedBy()).isEqualTo("2026000002");
        assertThat(reassigned.uploaderName()).isEqualTo("새주인");
    }

    private MockMultipartFile pdf(String filename, String content) {
        return new MockMultipartFile("file", filename, "application/pdf", content.getBytes());
    }

    private void saveMember(String studentId, String name) {
        saveMember(studentId, name, Member.Role.USER);
    }

    private void saveMember(String studentId, String name, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@example.com");
        member.setPassword("encoded");
        member.setEmailVerified(true);
        member.setRole(role);
        memberRepository.save(member);
    }

    private void authenticate(String studentId, String role) {
        TestingAuthenticationToken authentication = new TestingAuthenticationToken(
                studentId,
                "password",
                new SimpleGrantedAuthority(role)
        );
        authentication.setAuthenticated(true);
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
