package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.ArchiveAttachmentRepository;
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
import java.util.List;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.ArgumentMatchers.any;

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
    private ArchiveAttachmentRepository attachmentRepository;

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
        attachmentRepository.deleteAll();
        archiveFileRepository.deleteAll();
        memberRepository.deleteAll();
        auditLogRepository.flush();
        archiveFileVoteRepository.flush();
        attachmentRepository.flush();
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
        assertThat(response.attachments()).hasSize(1);
    }

    @Test
    void twoSelectedFilesCreateOnePostWithTwoDownloadableAttachments() throws Exception {
        var created = archiveService.uploadGroup("중간 족보", null, "GENERAL",
                List.of(pdf("one.pdf", "%PDF-1.4 one"), pdf("two.pdf", "%PDF-1.4 two")), "2026123456");

        assertThat(archiveFileRepository.count()).isEqualTo(1);
        assertThat(created.attachments()).extracting("originalName").containsExactly("one.pdf", "two.pdf");
        assertThat(created.attachments()).allSatisfy(attachment ->
                assertThat(archiveService.getAttachment(created.id(), attachment.id()).getStoredName()).isNotBlank());
        assertThat(attachmentRepository.count()).isEqualTo(2);
    }

    @Test
    void invalidSecondFileDoesNotPersistTheFirst() {
        assertThatThrownBy(() -> archiveService.uploadGroup("자료", null, "GENERAL",
                List.of(pdf("one.pdf", "%PDF-1.4"), new MockMultipartFile("files", "bad.html", "text/html", "x".getBytes())),
                "2026123456")).isInstanceOf(ResponseStatusException.class);
        assertThat(archiveFileRepository.count()).isZero();
        assertThat(attachmentRepository.count()).isZero();
    }

    @Test
    void secondStorageIOExceptionDeletesFirstBlobBeforeAnyDatabaseWrite() throws Exception {
        StorageService failingStorage = mock(StorageService.class);
        ArchiveFileRepository files = mock(ArchiveFileRepository.class);
        ArchiveAttachmentRepository attachments = mock(ArchiveAttachmentRepository.class);
        MemberRepository members = mock(MemberRepository.class);
        when(members.findByStudentId("2026123456"))
                .thenReturn(memberRepository.findByStudentId("2026123456"));
        when(failingStorage.store(any(MultipartFile.class)))
                .thenReturn("first-stored")
                .thenThrow(new IOException("second write failed"));
        ArchiveService failingService = new ArchiveService(files, attachments, failingStorage, members,
                mock(ArchiveFileVoteRepository.class), mock(RichContentSanitizer.class), mock(AuditLogService.class));

        assertThatThrownBy(() -> failingService.uploadGroup("자료", null, "GENERAL",
                List.of(pdf("first.pdf", "%PDF-1.4 first"), pdf("second.pdf", "%PDF-1.4 second")), "2026123456"))
                .isInstanceOf(IOException.class).hasMessage("second write failed");

        verify(failingStorage).delete("first-stored");
        verifyNoInteractions(files, attachments);
        assertThat(archiveFileRepository.count()).isZero();
        assertThat(attachmentRepository.count()).isZero();
    }

    @Test
    void groupReplacePreservesPostEngagementAndLegacyPrimaryReplacementPreservesExtras() throws Exception {
        saveMember("2026000001", "투표자", Member.Role.USER);
        var created = archiveService.uploadGroup("자료", null, "GENERAL",
                List.of(pdf("first.pdf", "%PDF-1.4 first"), pdf("second.pdf", "%PDF-1.4 second")), "2026123456");
        archiveService.vote("2026000001", created.id(), 1);
        archiveService.getAndIncrementView(created.id(), "2026123456");

        var metadataOnly = archiveService.update("2026123456", created.id(), "수정", null, "GENERAL", null);
        assertThat(metadataOnly.attachments()).extracting("originalName").containsExactly("first.pdf", "second.pdf");

        var legacyReplace = archiveService.update("2026123456", created.id(), "수정", null, "GENERAL",
                pdf("legacy.pdf", "%PDF-1.4 legacy"));
        assertThat(legacyReplace.attachments()).extracting("originalName").containsExactly("legacy.pdf", "second.pdf");

        var groupReplace = archiveService.updateGroup("2026123456", created.id(), "새 자료", null, "GENERAL", null,
                List.of(pdf("new-1.pdf", "%PDF-1.4 new1"), pdf("new-2.pdf", "%PDF-1.4 new2")));
        assertThat(groupReplace.id()).isEqualTo(created.id());
        assertThat(groupReplace.viewCount()).isEqualTo(1);
        assertThat(groupReplace.upvotes()).isEqualTo(1);
        assertThat(groupReplace.attachments()).extracting("originalName").containsExactly("new-1.pdf", "new-2.pdf");
        assertThat(archiveFileRepository.count()).isEqualTo(1);
        assertThat(attachmentRepository.count()).isEqualTo(2);
    }

    @Test
    void attachmentLookupMustMatchParentAndNonOwnerCannotReplaceGroup() throws Exception {
        saveMember("2026000001", "다른 회원", Member.Role.USER);
        var first = archiveService.uploadGroup("첫 글", null, "GENERAL",
                List.of(pdf("first.pdf", "%PDF-1.4"), pdf("second.pdf", "%PDF-1.4")), "2026123456");
        var second = archiveService.upload("둘째 글", null, pdf("other.pdf", "%PDF-1.4"), "2026000001");

        assertThatThrownBy(() -> archiveService.getAttachment(second.id(), first.attachments().get(1).id()))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(404));
        assertThatThrownBy(() -> archiveService.updateGroup("2026000001", first.id(), "침범", null, "GENERAL", null,
                List.of(pdf("new.pdf", "%PDF-1.4"))))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(403));
        assertThat(archiveService.list()).filteredOn(file -> file.id().equals(first.id())).singleElement()
                .extracting(file -> file.attachments().size()).isEqualTo(2);
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
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void rolledBackGroupReplacementKeepsOldAttachmentsAndCleansAllNewBlobs() throws Exception {
        var created = archiveService.uploadGroup("원제목", null, "GENERAL",
                List.of(pdf("old-1.pdf", "%PDF-1.4 old1"), pdf("old-2.pdf", "%PDF-1.4 old2")), "2026123456");
        List<String> oldNames = attachmentRepository.findByArchiveFileIdOrderByPositionAsc(created.id()).stream()
                .map(attachment -> attachment.getStoredName()).toList();
        AtomicReference<List<String>> newNames = new AtomicReference<>();

        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            try {
                archiveService.updateGroup("2026123456", created.id(), "교체", null, "GENERAL", null,
                        List.of(pdf("new-1.pdf", "%PDF-1.4 new1"), pdf("new-2.pdf", "%PDF-1.4 new2")));
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            newNames.set(attachmentRepository.findByArchiveFileIdOrderByPositionAsc(created.id()).stream()
                    .map(attachment -> attachment.getStoredName()).toList());
            throw new RuntimeException("force group rollback");
        })).hasMessage("force group rollback");

        assertThat(attachmentRepository.findByArchiveFileIdOrderByPositionAsc(created.id()).stream()
                .map(attachment -> attachment.getStoredName())).containsExactlyElementsOf(oldNames);
        for (String oldName : oldNames) {
            assertThat(storageService.load(oldName).exists()).isTrue();
        }
        for (String newName : newNames.get()) {
            assertThatThrownBy(() -> storageService.load(newName)).isInstanceOf(ResponseStatusException.class);
        }
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void committedDeleteRemovesAllAttachmentBlobs() throws Exception {
        saveMember("2026000001", "회장", Member.Role.ADMIN);
        var created = archiveService.uploadGroup("자료", null, "GENERAL",
                List.of(pdf("one.pdf", "%PDF-1.4 one"), pdf("two.pdf", "%PDF-1.4 two")), "2026123456");
        List<String> storedNames = attachmentRepository.findByArchiveFileIdOrderByPositionAsc(created.id()).stream()
                .map(attachment -> attachment.getStoredName()).toList();
        authenticate("2026000001", "ROLE_ADMIN");

        archiveService.delete(created.id());

        assertThat(archiveFileRepository.findById(created.id())).isEmpty();
        assertThat(attachmentRepository.findByArchiveFileIdOrderByPositionAsc(created.id())).isEmpty();
        for (String storedName : storedNames) {
            assertThatThrownBy(() -> storageService.load(storedName)).isInstanceOf(ResponseStatusException.class);
        }
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
