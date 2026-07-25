package com.coms.backend.service;

import com.coms.backend.dto.SiteSettingsRequest;
import com.coms.backend.repository.SiteSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:site-settings-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@Transactional
class SiteSettingsServiceTest {

    @Autowired
    private SiteSettingsService siteSettingsService;

    @Autowired
    private SiteSettingsRepository siteSettingsRepository;

    @BeforeEach
    void setUp() {
        siteSettingsRepository.deleteAll();
    }

    @Test
    void currentCreatesSingletonWithRealDefaultCopy() {
        var current = siteSettingsService.current();

        assertThat(current.semesterLabel()).isEqualTo("2026 Semester Ready");
        assertThat(current.homeHeroCopy()).contains("광운대학교 컴퓨터 학술동아리");
        assertThat(current.recruitmentPeriod()).contains("공식 채널");
        assertThat(current.contactLinks()).extracting("label")
                .contains("Mail");
        assertThat(siteSettingsRepository.count()).isEqualTo(1);
    }

    @Test
    void publishUpdatesSingletonAndNormalizesContactLinks() {
        var updated = siteSettingsService.publish(new SiteSettingsRequest(
                "  2026-2 운영 중  ",
                "모집 예정",
                "9월 초 별도 공지",
                "새 학기 COM's",
                "함께 공부하고 만드는 운영 공지입니다.",
                List.of(new SiteSettingsRequest.ContactLinkRequest("  문의 메일  ", "  mailto:kwcoms69@gmail.com  "))
        ));

        assertThat(updated.semesterLabel()).isEqualTo("2026-2 운영 중");
        assertThat(updated.recruitmentStatus()).isEqualTo("모집 예정");
        assertThat(updated.contactLinks()).hasSize(1);
        assertThat(updated.contactLinks().get(0).label()).isEqualTo("문의 메일");
        assertThat(updated.contactLinks().get(0).href()).isEqualTo("mailto:kwcoms69@gmail.com");
        assertThat(siteSettingsRepository.count()).isEqualTo(1);
    }

    @Test
    void publishRejectsBlankRequiredCopyAndUnsafeLinks() {
        assertThatThrownBy(() -> siteSettingsService.publish(new SiteSettingsRequest(
                "",
                "모집 예정",
                "9월 초 별도 공지",
                "새 학기 COM's",
                "함께 공부합니다.",
                List.of(new SiteSettingsRequest.ContactLinkRequest("문의", "javascript:alert(1)"))
        ))).isInstanceOf(ResponseStatusException.class);

        assertThatThrownBy(() -> siteSettingsService.publish(requestWithLink("https://admin@example.com/contact")))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> siteSettingsService.publish(requestWithLink("https://example.com/contact\nspoofed")))
                .isInstanceOf(ResponseStatusException.class);
    }

    private SiteSettingsRequest requestWithLink(String href) {
        return new SiteSettingsRequest(
                "2026-2 운영 중",
                "모집 예정",
                "9월 초 별도 공지",
                "새 학기 COM's",
                "함께 공부합니다.",
                List.of(new SiteSettingsRequest.ContactLinkRequest("문의", href))
        );
    }
}
