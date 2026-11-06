package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NoticeRepository;
import com.coms.backend.repository.RichBodyMediaRepository;
import com.coms.backend.repository.SponsorPageSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Calls the service proxies without a test transaction so failed saves must roll back in the database. */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:rich-media-rollback-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/rich-media-rollback"
})
class RichBodyMediaAttachmentTransactionTest {
    private static final String ACTOR = "2026000777";
    private static final String INVALID_BODY = "[{\"type\":\"image\",\"mediaId\":987654321}]";

    @Autowired NoticeService notices;
    @Autowired ArchiveService archives;
    @Autowired SponsorService sponsors;
    @Autowired NoticeRepository noticeRows;
    @Autowired RichBodyMediaRepository mediaRows;
    @Autowired RichBodyMediaService richMedia;
    @Autowired ArchiveFileRepository archiveRows;
    @Autowired SponsorPageSettingsRepository settingsRows;
    @Autowired MemberRepository members;

    @BeforeEach
    void memberExists() {
        if (members.findByStudentId(ACTOR).isEmpty()) {
            Member member = new Member();
            member.setStudentId(ACTOR);
            member.setName("관리자");
            member.setEmail("rich-rollback@example.com");
            member.setPassword("unused");
            member.setRole(Member.Role.ADMIN);
            member.setEmailVerified(true);
            members.save(member);
        }
    }

    @Test
    void memberQuotaIgnoresDetachedRowsButSiteCapCountsThem() {
        long actorId = members.findByStudentId(ACTOR).orElseThrow().getId();
        long count = mediaRows.countPending(actorId);
        long memberBytes = mediaRows.sumPendingBytes(actorId);
        long siteBytes = mediaRows.sumAllPendingBytes();
        mediaRows.saveAndFlush(media(RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.NOTICE, actorId));
        RichBodyMedia detached = media(RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.NOTICE, actorId);
        detached.attach(1L, LocalDateTime.now());
        detached.detach(LocalDateTime.now());
        mediaRows.saveAndFlush(detached);

        assertThat(mediaRows.countPending(actorId)).isEqualTo(count + 1);
        assertThat(mediaRows.sumPendingBytes(actorId)).isEqualTo(memberBytes + 10);
        assertThat(mediaRows.sumAllPendingBytes()).isEqualTo(siteBytes + 20);
    }

    @Test
    void selfDetachedRowsCountTowardUploaderQuotaButOthersDetachedDoNot() {
        long actorId = members.findByStudentId(ACTOR).orElseThrow().getId();
        long count = mediaRows.countPending(actorId);
        long bytes = mediaRows.sumPendingBytes(actorId);
        RichBodyMedia selfDetached = media(RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.NOTICE, actorId);
        selfDetached.attach(1L, LocalDateTime.now());
        selfDetached.detach(LocalDateTime.now(), actorId);
        mediaRows.saveAndFlush(selfDetached);
        assertThat(mediaRows.countPending(actorId)).isEqualTo(count + 1);
        assertThat(mediaRows.sumPendingBytes(actorId)).isEqualTo(bytes + 10);

        RichBodyMedia byOther = media(RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.NOTICE, actorId);
        byOther.attach(1L, LocalDateTime.now());
        byOther.detach(LocalDateTime.now(), actorId + 1000);
        mediaRows.saveAndFlush(byOther);
        assertThat(mediaRows.countPending(actorId)).isEqualTo(count + 1);
        assertThat(mediaRows.sumPendingBytes(actorId)).isEqualTo(bytes + 10);
    }

    private enum InvalidReference { MISSING, WRONG_SCOPE, WRONG_KIND, OTHER_UPLOADER, OTHER_OWNER }

    @ParameterizedTest
    @EnumSource(InvalidReference.class)
    void rejectedNoticeEditRollsBackBodyAndEarlierAttachment(InvalidReference reason) {
        long id = notices.create(ACTOR, new NoticeRequest("원본", "원본 본문", null, false, "GENERAL")).id();
        long actorId = members.findByStudentId(ACTOR).orElseThrow().getId();
        long validId = mediaRows.saveAndFlush(media(RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.NOTICE, actorId)).getId();
        long invalidId = invalidReference(reason, actorId);
        String changedBody = "[{\"type\":\"image\",\"mediaId\":" + validId + "},"
                + "{\"type\":\"image\",\"mediaId\":" + invalidId + "}]";

        assertRejected(() -> notices.update(ACTOR, id,
                new NoticeRequest("변경", changedBody, null, false, "GENERAL")));

        var stored = noticeRows.findById(id).orElseThrow();
        assertThat(stored.getTitle()).isEqualTo("원본");
        assertThat(stored.getContent()).isEqualTo("원본 본문");
        assertThat(mediaRows.findById(validId).orElseThrow().getOwnerId()).isNull();
    }

    @Test
    void rejectedNoticeCreateLeavesNoNewRow() {
        long before = noticeRows.count();

        assertRejected(() -> notices.create(ACTOR,
                new NoticeRequest("변경", INVALID_BODY, null, false, "GENERAL")));

        assertThat(noticeRows.count()).isEqualTo(before);
    }

    @Test
    void recentlyDetachedOldUploadSurvivesPurge() {
        var row = oldAttachedMedia();
        richMedia.syncAttachments(RichBodyMedia.Scope.NOTICE, row.getOwnerId(), "[]", ACTOR);

        richMedia.deleteOrphanedOlderThan(LocalDateTime.now().minusHours(24));

        var stored = mediaRows.findById(row.getId()).orElseThrow();
        assertThat(stored.getOwnerId()).isNull();
        assertThat(stored.getDetachedAt()).isAfter(LocalDateTime.now().minusMinutes(1));
    }

    @Test
    void detachedForOver24HoursIsPurgedEvenWithLongerPendingThreshold() {
        var row = oldAttachedMedia();
        row.detach(LocalDateTime.now().minusHours(25));
        mediaRows.saveAndFlush(row);

        richMedia.deleteOrphanedOlderThan(LocalDateTime.now().minusHours(48));

        assertThat(mediaRows.findById(row.getId())).isEmpty();
    }

    @Test
    void reattachmentPersistsClearedDetachmentTimestampAndSurvivesPurge() {
        var row = oldAttachedMedia();
        long ownerId = row.getOwnerId();
        row.detach(LocalDateTime.now().minusHours(25));
        mediaRows.saveAndFlush(row);
        assertThat(mediaRows.findById(row.getId()).orElseThrow().getDetachedAt()).isNotNull();

        richMedia.syncAttachments(RichBodyMedia.Scope.NOTICE, ownerId,
                "[{\"type\":\"image\",\"mediaId\":" + row.getId() + "}]", ACTOR);
        richMedia.deleteOrphanedOlderThan(LocalDateTime.now().minusHours(24));

        var stored = mediaRows.findById(row.getId()).orElseThrow();
        assertThat(stored.getOwnerId()).isEqualTo(ownerId);
        assertThat(stored.getDetachedAt()).isNull();
    }

    @Test
    void onlyExpiredNeverAttachedUploadsArePurged() {
        long actorId = members.findByStudentId(ACTOR).orElseThrow().getId();
        var old = media(RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.NOTICE, actorId);
        ReflectionTestUtils.setField(old, "createdAt", LocalDateTime.now().minusHours(49));
        old = mediaRows.saveAndFlush(old);
        var recent = mediaRows.saveAndFlush(media(RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.NOTICE, actorId));

        richMedia.deleteOrphanedOlderThan(LocalDateTime.now().minusHours(48));

        assertThat(mediaRows.findById(old.getId())).isEmpty();
        assertThat(mediaRows.findById(recent.getId())).isPresent();
    }

    private RichBodyMedia oldAttachedMedia() {
        long actorId = members.findByStudentId(ACTOR).orElseThrow().getId();
        var row = media(RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.NOTICE, actorId);
        ReflectionTestUtils.setField(row, "createdAt", LocalDateTime.now().minusDays(30));
        row = mediaRows.saveAndFlush(row);
        row.attach(row.getId(), LocalDateTime.now().minusDays(29));
        return mediaRows.saveAndFlush(row);
    }

    @Test
    void rejectedArchiveEditLeavesStoredDescriptionAndTitleUnchanged() throws Exception {
        long id = archives.upload("원본", "원본 본문", pdf(), ACTOR).id();

        assertRejected(() -> archives.update(ACTOR, id, "변경", INVALID_BODY, "GENERAL", null));

        var stored = archiveRows.findById(id).orElseThrow();
        assertThat(stored.getTitle()).isEqualTo("원본");
        assertThat(stored.getDescription()).isEqualTo("원본 본문");
    }

    @Test
    void rejectedArchiveCreateLeavesNoNewRow() {
        long before = archiveRows.count();

        assertRejected(() -> archives.upload("변경", INVALID_BODY, pdf(), ACTOR));

        assertThat(archiveRows.count()).isEqualTo(before);
    }

    @Test
    void rejectedSponsorSettingsLeaveStoredBodyUnchanged() {
        sponsors.saveSettings(Map.of("introHtml", "원본 본문"), ACTOR);
        String before = settingsRows.findById(1).orElseThrow().getSettings();

        assertRejected(() -> sponsors.saveSettings(Map.of("introHtml", INVALID_BODY), ACTOR));

        assertThat(settingsRows.findById(1).orElseThrow().getSettings()).isEqualTo(before);
    }

    private static MockMultipartFile pdf() {
        return new MockMultipartFile("file", "body.pdf", "application/pdf", "%PDF-1.4 body".getBytes());
    }

    private static void assertRejected(ThrowingAction action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,
                ex -> {
                    assertThat(ex.getStatusCode().value()).isEqualTo(400);
                    assertThat(ex.getReason()).isEqualTo("첨부할 수 없는 파일이 포함되어 있습니다. 다시 올려 주세요.");
                });
    }

    private long invalidReference(InvalidReference reason, long actorId) {
        if (reason == InvalidReference.MISSING) return 987654321L;
        long uploaderId = actorId;
        if (reason == InvalidReference.OTHER_UPLOADER) {
            Member other = new Member();
            other.setStudentId("2026000888");
            other.setName("다른 회원");
            other.setEmail("rich-rollback-other@example.com");
            other.setPassword("unused");
            other.setRole(Member.Role.USER);
            other.setEmailVerified(true);
            uploaderId = members.save(other).getId();
        }
        RichBodyMedia.Kind kind = reason == InvalidReference.WRONG_KIND
                ? RichBodyMedia.Kind.FILE : RichBodyMedia.Kind.IMAGE;
        RichBodyMedia.Scope scope = reason == InvalidReference.WRONG_SCOPE
                ? RichBodyMedia.Scope.ARCHIVE : RichBodyMedia.Scope.NOTICE;
        RichBodyMedia row = media(kind, scope, uploaderId);
        if (reason == InvalidReference.OTHER_OWNER) row.attach(987654321L, java.time.LocalDateTime.now());
        return mediaRows.saveAndFlush(row).getId();
    }

    private static RichBodyMedia media(RichBodyMedia.Kind kind, RichBodyMedia.Scope scope, long uploaderId) {
        return new RichBodyMedia(kind, scope, "stored-rollback-" + java.util.UUID.randomUUID(),
                "image.png", "image/png", 10, uploaderId, java.time.LocalDateTime.now());
    }

    @FunctionalInterface
    private interface ThrowingAction { void run() throws Exception; }
}
