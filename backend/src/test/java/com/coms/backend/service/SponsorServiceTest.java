package com.coms.backend.service;

import com.coms.backend.dto.SponsorAdminResponse;
import com.coms.backend.dto.SponsorPageSettings;
import com.coms.backend.dto.SponsorRequest;
import com.coms.backend.dto.SponsorTierRequest;
import com.coms.backend.dto.SponsorTierResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:sponsor-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/sponsor-service"
})
@Transactional
class SponsorServiceTest {

    // 업로드 검증이 매직 바이트를 확인하므로 픽스처도 실제 시그니처를 가져야 한다.
    // 실제로 디코딩되는 1x1 PNG — LocalStorageService 가 메타데이터 제거를 위해 재인코딩하므로
    // 헤더만 흉내 낸 픽스처로는 저장 경로 전체를 검증할 수 없다.
    private static final byte[] PNG_BYTES = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, (byte) 0x90, 0x77, 0x53,
            (byte) 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x78, (byte) 0x9C, 0x63, (byte) 0xF8,
            (byte) 0xCF, (byte) 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, (byte) 0xC9, (byte) 0xFE, (byte) 0x92,
            (byte) 0xEF, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, (byte) 0xAE, 0x42, 0x60, (byte) 0x82};
    private static final byte[] EXECUTABLE_BYTES = {0x4D, 0x5A, (byte) 0x90, 0x00, 0x03, 0x00, 0x00, 0x00};

    @Autowired
    private SponsorService sponsorService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void publicListAnonymizesAndNeverCarriesTheAmountNote() throws Exception {
        Long tierId = tier("골드");
        sponsorService.create(sponsor("익명 스폰서", tierId, b -> b.amountNote("300,000원").anonymous(true)));
        sponsorService.create(sponsor("공개 스폰서", tierId, b -> b.amountNote("500,000원")));

        List<SponsorTierResponse> groups = sponsorService.publicList();
        String json = objectMapper.writeValueAsString(groups);

        assertThat(json).doesNotContain("amountNote", "300,000원", "500,000원");
        assertThat(groups).singleElement().satisfies(group -> {
            assertThat(group.sponsors()).extracting("name").containsExactlyInAnyOrder("익명 후원자", "공개 스폰서");
            assertThat(group.sponsors()).filteredOn("anonymous", true).singleElement().satisfies(sponsor -> {
                // 익명 후원자는 이름/로고/링크/소개가 모두 지워진 자리 표시자로만 나간다.
                assertThat(sponsor.name()).isEqualTo("익명 후원자");
                assertThat(sponsor.logoUrl()).isNull();
                assertThat(sponsor.linkUrl()).isNull();
                assertThat(sponsor.description()).isNull();
            });
        });
    }

    @Test
    void expiredAndHiddenSponsorsLeaveThePublicListButStayInTheAdminList() {
        Long tierId = tier("실버");
        sponsorService.create(sponsor("현재 후원", tierId, b -> b));
        sponsorService.create(sponsor("만료 후원", tierId, b -> b.untilDate(LocalDate.now().minusDays(1))));
        sponsorService.create(sponsor("숨김 후원", tierId, b -> b.visible(false)));

        assertThat(sponsorService.publicList())
                .flatExtracting(SponsorTierResponse::sponsors)
                .extracting("name")
                .containsExactly("현재 후원");
        assertThat(sponsorService.page().sponsorCount()).isEqualTo(1);

        assertThat(sponsorService.adminList()).extracting("name")
                .contains("현재 후원", "만료 후원", "숨김 후원");
        assertThat(sponsorService.adminList()).filteredOn("name", "만료 후원")
                .singleElement()
                .satisfies(row -> assertThat(row.expired()).isTrue());
    }

    @Test
    void imageUploadRejectsBytesThatAreNotTheDeclaredImage() {
        MockMultipartFile disguised = new MockMultipartFile(
                "image", "logo.png", "image/png", EXECUTABLE_BYTES);

        assertThatThrownBy(() -> sponsorService.uploadImage(disguised))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("이미지 파일 내용이 형식과 일치하지 않습니다");

        MockMultipartFile real = new MockMultipartFile("image", "logo.png", "image/png", PNG_BYTES);
        assertThat(sponsorService.uploadImage(real).url()).startsWith("/api/sponsors/images/");
    }

    @Test
    void pageSettingsRejectABadAccentColourAndAnUnknownKey() {
        assertThatThrownBy(() -> sponsorService.saveSettings(settings("red", "grid")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("#RRGGBB");
        assertThatThrownBy(() -> sponsorService.saveSettings(settings("#112233", "carousel")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("grid");
        // 알 수 없는 키는 바인딩 단계에서 거부된다 — 서비스가 자체 strict ObjectMapper 로 파싱한다.
        Map<String, Object> withUnknownKey = settings("#112233", "grid");
        withUnknownKey.put("evil", 1);
        assertThatThrownBy(() -> sponsorService.saveSettings(withUnknownKey))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("알 수 없는");

        SponsorPageSettings saved = sponsorService.saveSettings(settings("#112233", "list"));
        assertThat(saved.accentColor()).isEqualTo("#112233");
        assertThat(saved.layout()).isEqualTo("list");
        assertThat(sponsorService.adminSettings().layout()).isEqualTo("list");
    }

    @Test
    void reorderPersistsTheRequestedOrder() {
        Long tierId = tier("플래티넘");
        Long first = sponsorService.create(sponsor("가", tierId, b -> b)).id();
        Long second = sponsorService.create(sponsor("나", tierId, b -> b)).id();
        Long third = sponsorService.create(sponsor("다", tierId, b -> b)).id();

        sponsorService.reorder(List.of(third, first, second));

        assertThat(sponsorService.adminList()).extracting(SponsorAdminResponse::id)
                .containsExactly(third, first, second);
        assertThat(sponsorService.publicList())
                .flatExtracting(SponsorTierResponse::sponsors)
                .extracting("name")
                .containsExactly("다", "가", "나");
    }

    @Test
    void sponsorLinksMustBeHttpOrHttps() {
        Long tierId = tier("골드");
        assertThatThrownBy(() -> sponsorService.create(sponsor("나쁜 링크", tierId, b -> b.linkUrl("javascript:alert(1)"))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("http");

        assertThat(sponsorService.create(sponsor("좋은 링크", tierId, b -> b.linkUrl("https://example.com"))).linkUrl())
                .isEqualTo("https://example.com");
    }

    private Long tier(String name) {
        return sponsorService.createTier(new SponsorTierRequest(name, "#d4a017", null, null)).id();
    }

    /** The service binds the raw body itself, so the tests feed it the same map shape MVC would. */
    private static Map<String, Object> settings(String accentColor, String layout) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("heroTitle", "후원자");
        body.put("heroSubtitle", "소개");
        body.put("accentColor", accentColor);
        body.put("layout", layout);
        body.put("thankYouMessage", "감사합니다.");
        return body;
    }

    /**
     * A sponsor request with every optional field empty, then whatever the caller overrides —
     * so each test only spells out the one field it is actually about.
     */
    private static SponsorRequest sponsor(String name, Long tierId, java.util.function.UnaryOperator<Draft> customize) {
        return customize.apply(new Draft()).toRequest(name, tierId);
    }

    private static final class Draft {
        private String linkUrl;
        private String amountNote;
        private LocalDate untilDate;
        private Boolean anonymous;
        private Boolean visible;

        Draft linkUrl(String value) { this.linkUrl = value; return this; }
        Draft amountNote(String value) { this.amountNote = value; return this; }
        Draft untilDate(LocalDate value) { this.untilDate = value; return this; }
        Draft anonymous(boolean value) { this.anonymous = value; return this; }
        Draft visible(boolean value) { this.visible = value; return this; }

        SponsorRequest toRequest(String name, Long tierId) {
            return new SponsorRequest(name, tierId, null, linkUrl, null, amountNote, null, untilDate, anonymous, visible, null);
        }
    }
}
