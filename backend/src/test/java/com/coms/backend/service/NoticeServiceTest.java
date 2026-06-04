package com.coms.backend.service;

import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.repository.NoticeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:notice-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class NoticeServiceTest {

    @Autowired
    private NoticeService noticeService;

    @Autowired
    private NoticeRepository noticeRepository;

    @BeforeEach
    void setUp() {
        noticeRepository.deleteAll();
    }

    @Test
    void defaultsNoticeCategoryToGeneral() {
        var notice = noticeService.create(new NoticeRequest("공지", "내용", "관리자", false, null));

        assertThat(notice.category()).isEqualTo("GENERAL");
    }

    @Test
    void createsJobNoticeCategory() {
        var notice = noticeService.create(new NoticeRequest("채용", "취업공고", "관리자", true, "JOB"));

        assertThat(notice.category()).isEqualTo("JOB");
    }
}
