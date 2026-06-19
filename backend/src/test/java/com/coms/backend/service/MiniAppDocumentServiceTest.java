package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.MiniAppDocumentRequest;
import com.coms.backend.dto.MiniAppDocumentResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.MiniAppDocumentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:mini-app-document-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "mail.enabled=false",
        "integration.hmac-secret=unit-test-secret-1234567890-abcdef"
})
class MiniAppDocumentServiceTest {
    @Autowired
    private MiniAppDocumentService service;

    @Autowired
    private MiniAppDocumentRepository documentRepository;

    @Autowired
    private MemberRepository memberRepository;

    @BeforeEach
    void setUp() {
        documentRepository.deleteAll();
        memberRepository.deleteAll();

        Member member = new Member();
        member.setStudentId("20250001");
        member.setName("홍길동");
        member.setEmail("20250001@kw.ac.kr");
        member.setPassword("encoded");
        member.setRole(Member.Role.USER);
        memberRepository.save(member);
    }

    @Test
    void savesProfileDocumentForAuthenticatedOwner() {
        MiniAppDocumentResponse saved = service.saveProfileDocument(
                "20250001",
                "tier",
                "result",
                "tier-result-a",
                sampleRequest(false)
        );

        assertThat(saved.ownerStudentId()).isEqualTo("20250001");
        assertThat(saved.ownerName()).isEqualTo("홍길동");
        assertThat(saved.title()).isEqualTo("개발 언어 티어표");
        assertThat(saved.payload()).containsEntry("templateTitle", "개발 언어 티어표");
        assertThat(saved.shared()).isFalse();

        assertThat(service.listProfileDocuments("20250001", "tier"))
                .extracting(MiniAppDocumentResponse::contentId)
                .containsExactly("tier-result-a");
        assertThat(service.listProfileDocuments("20259999", "tier")).isEmpty();
    }

    @Test
    void sharesProfileDocumentIntoPublicGalleryAndLink() {
        service.saveProfileDocument("20250001", "worldcup", "result", "worldcup-result-a", sampleRequest(false));

        MiniAppDocumentResponse shared = service.shareDocument("20250001", "worldcup", "result", "worldcup-result-a");

        assertThat(shared.shared()).isTrue();
        assertThat(shared.shareSlug()).isNotBlank();
        assertThat(shared.shareUrl()).isEqualTo("/worldcup/shared/" + shared.shareSlug());
        assertThat(service.listSharedDocuments("worldcup"))
                .extracting(MiniAppDocumentResponse::contentId)
                .containsExactly("worldcup-result-a");
        assertThat(service.getSharedDocument("worldcup", shared.shareSlug()).contentId()).isEqualTo("worldcup-result-a");
    }

    @Test
    void rejectsUnknownMiniApp() {
        assertThatThrownBy(() -> service.saveProfileDocument("20250001", "unknown", "result", "x", sampleRequest(false)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    private MiniAppDocumentRequest sampleRequest(boolean shared) {
        return new MiniAppDocumentRequest(
                "개발 언어 티어표",
                "S/A/B/C로 나눈 결과",
                shared,
                Map.of("templateTitle", "개발 언어 티어표", "items", java.util.List.of("TypeScript"))
        );
    }
}
