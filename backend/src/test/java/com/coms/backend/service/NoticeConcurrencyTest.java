package com.coms.backend.service;

import com.coms.backend.controller.ApiExceptionHandler;
import com.coms.backend.controller.NoticeController;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NoticeRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:notice-concurrency-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/notice-concurrency"
})
class NoticeConcurrencyTest {
    private static final String ADMIN = "2026123451";
    private static final String OWNER = "2026123452";
    private static Flyway postgresSchema;

    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        String url = System.getenv("COMS_PG_TEST_URL");
        if (url == null || url.isBlank()) return;
        String schema = "notice_concurrency_test";
        String user = System.getenv().getOrDefault("COMS_PG_TEST_USER", "postgres");
        String password = System.getenv().getOrDefault("COMS_PG_TEST_PASSWORD", "postgres");
        postgresSchema = Flyway.configure().dataSource(url, user, password).schemas(schema).cleanDisabled(false).load();
        postgresSchema.clean();
        registry.add("spring.datasource.url", () -> url + (url.contains("?") ? "&" : "?") + "currentSchema=" + schema);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.username", () -> user);
        registry.add("spring.datasource.password", () -> password);
        registry.add("spring.flyway.enabled", () -> true);
        registry.add("spring.flyway.schemas", () -> schema);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.jpa.defer-datasource-initialization", () -> false);
        registry.add("spring.sql.init.mode", () -> "never");
    }

    @AfterAll
    static void cleanPostgresSchema() {
        if (postgresSchema != null) postgresSchema.clean();
    }

    @Autowired private NoticeService noticeService;
    @Autowired private NoticeRepository noticeRepository;
    @Autowired private MemberRepository memberRepository;
    @Autowired private RichBodyMediaService richBodyMediaService;
    @Autowired private PlatformTransactionManager transactions;

    @Test
    void staleAuthorTransactionCannotRepublishANoticeOrItsMedia() throws Exception {
        memberRepository.save(member(ADMIN, Member.Role.ADMIN));
        memberRepository.save(member(OWNER, Member.Role.USER));
        var file = richBodyMediaService.upload(RichBodyMedia.Scope.NOTICE, RichBodyMedia.Kind.FILE,
                new MockMultipartFile("file", "guide.pdf", "application/pdf", "%PDF-1.4 guide".getBytes()), ADMIN);
        String body = "[{\"type\":\"file\",\"fileId\":" + file.getId() + "}]";
        var notice = noticeService.create(ADMIN, new NoticeRequest("공개", body, null, false, null, true));
        var assigned = noticeService.updateAuthor(ADMIN, notice.id(), null, OWNER);
        assertThat(richBodyMediaService.get(file.getId(), null).getOwnerId()).isEqualTo(notice.id());

        var mvc = MockMvcBuilders.standaloneSetup(new NoticeController(noticeService))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        var authorLoaded = new CountDownLatch(1);
        var adminCommitted = new CountDownLatch(1);
        var executor = Executors.newSingleThreadExecutor();
        try {
            var staleSave = executor.submit(() -> new TransactionTemplate(transactions).execute(tx -> {
                try {
                    assertThat(noticeRepository.findById(notice.id()).orElseThrow().isPublicVisible()).isTrue();
                    authorLoaded.countDown();
                    assertThat(adminCommitted.await(10, TimeUnit.SECONDS)).isTrue();
                    int status = mvc.perform(put("/api/notices/{id}", notice.id())
                                    .principal(new UsernamePasswordAuthenticationToken(OWNER, null, List.of()))
                                    .contentType("application/json")
                                    .content("""
                                            {"title":"오래된 수정","content":"오래된 본문","version":%d}
                                            """.formatted(assigned.version())))
                            .andReturn().getResponse().getStatus();
                    if (status != 200) tx.setRollbackOnly();
                    return status;
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
            }));
            assertThat(authorLoaded.await(10, TimeUnit.SECONDS)).isTrue();
            noticeService.update(ADMIN, notice.id(), new NoticeRequest("비공개", body, null, false, null, false, assigned.version()));
            adminCommitted.countDown();
            assertThat(staleSave.get(10, TimeUnit.SECONDS)).isEqualTo(409);
        } finally {
            adminCommitted.countDown();
            executor.shutdownNow();
        }

        var stored = noticeRepository.findById(notice.id()).orElseThrow();
        assertThat(stored.isPublicVisible()).isFalse();
        assertThat(stored.getTitle()).isEqualTo("비공개");
        assertThat(stored.getContent()).contains("\"fileId\":" + file.getId());
        mvc.perform(get("/api/notices/{id}", notice.id())).andExpect(status().isNotFound());
        assertThatThrownBy(() -> richBodyMediaService.get(file.getId(), null))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode().value()).isEqualTo(404));
    }

    private static Member member(String studentId, Member.Role role) {
        var member = new Member();
        member.setStudentId(studentId);
        member.setName(studentId);
        member.setEmail(studentId + "@kw.ac.kr");
        member.setPassword("password");
        member.setRole(role);
        return member;
    }

    @Test
    void editorMustSubmitTheVersionItOpenedBeforeChangingContentOrVisibility() throws Exception {
        String editor = "2026123453";
        memberRepository.save(member(editor, Member.Role.ADMIN));
        var opened = noticeService.create(editor, new NoticeRequest("열어 둔 공지", "본문", null, false, null, true));
        var hidden = noticeService.update(editor, opened.id(), new NoticeRequest("열어 둔 공지", "본문", null, false, null, false, opened.version()));
        var mvc = MockMvcBuilders.standaloneSetup(new NoticeController(noticeService))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        var principal = new UsernamePasswordAuthenticationToken(editor, null, List.of());
        String edit = "\"title\":\"편집한 공지\",\"content\":\"수정한 본문\"";

        mvc.perform(put("/api/notices/{id}", opened.id()).principal(principal).contentType("application/json")
                        .content("{" + edit + ",\"publicVisible\":true,\"version\":" + opened.version() + "}"))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/notices/{id}", opened.id()).principal(principal).contentType("application/json")
                        .content("{" + edit + ",\"version\":" + opened.version() + "}"))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/notices/{id}", opened.id()).principal(principal).contentType("application/json")
                        .content("{" + edit + "}"))
                .andExpect(status().isBadRequest());
        assertThat(noticeRepository.findById(opened.id()).orElseThrow().getTitle()).isEqualTo("열어 둔 공지");

        mvc.perform(put("/api/notices/{id}", opened.id()).principal(principal).contentType("application/json")
                        .content("{" + edit + ",\"version\":" + hidden.version() + "}"))
                .andExpect(status().isOk());
        var edited = noticeRepository.findById(opened.id()).orElseThrow();
        assertThat(edited.getTitle()).isEqualTo("편집한 공지");
        assertThat(edited.isPublicVisible()).isFalse();
        assertThat(edited.getVersion()).isGreaterThan(hidden.version());
    }
}
