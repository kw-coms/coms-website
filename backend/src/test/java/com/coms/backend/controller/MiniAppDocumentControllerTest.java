package com.coms.backend.controller;

import com.coms.backend.dto.MiniAppDocumentRequest;
import com.coms.backend.dto.MiniAppDocumentResponse;
import com.coms.backend.service.MiniAppDocumentService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MiniAppDocumentControllerTest {
    private final MiniAppDocumentService service = mock(MiniAppDocumentService.class);
    private final MiniAppDocumentController controller = new MiniAppDocumentController(service);
    private final TestingAuthenticationToken auth = new TestingAuthenticationToken("20250001", "password");

    @Test
    void savesProfileDocumentForAuthenticatedStudent() {
        MiniAppDocumentRequest request = sampleRequest();
        MiniAppDocumentResponse response = sampleResponse(false);
        when(service.saveProfileDocument("20250001", "tier", "result", "result-a", request)).thenReturn(response);

        var result = controller.saveProfileDocument(auth, "XMLHttpRequest", "tier", "result", "result-a", request);

        assertThat(result.getBody()).isEqualTo(response);
        verify(service).saveProfileDocument("20250001", "tier", "result", "result-a", request);
    }

    @Test
    void sharesProfileDocumentForAuthenticatedStudent() {
        MiniAppDocumentResponse response = sampleResponse(true);
        when(service.shareDocument("20250001", "tier", "result", "result-a")).thenReturn(response);

        var result = controller.shareProfileDocument(auth, "XMLHttpRequest", "tier", "result", "result-a");

        assertThat(result.getBody()).isEqualTo(response);
        verify(service).shareDocument("20250001", "tier", "result", "result-a");
    }

    @Test
    void listsSharedDocumentsWithoutAjaxHeader() {
        when(service.listSharedDocuments("tier")).thenReturn(List.of(sampleResponse(true)));

        var result = controller.listSharedDocuments("tier");

        assertThat(result.getBody()).hasSize(1);
        verify(service).listSharedDocuments("tier");
    }

    @Test
    void rejectsProfileRequestsWithoutAjaxHeader() {
        assertThatThrownBy(() -> controller.listProfileDocuments(auth, null, "tier"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    private MiniAppDocumentRequest sampleRequest() {
        return new MiniAppDocumentRequest("개발 언어 티어표", "결과", false, Map.of("templateTitle", "개발 언어 티어표"));
    }

    private MiniAppDocumentResponse sampleResponse(boolean shared) {
        return new MiniAppDocumentResponse(
                1L,
                "tier",
                "result",
                "result-a",
                "개발 언어 티어표",
                "결과",
                "20250001",
                "홍길동",
                shared,
                shared ? "abc123" : null,
                shared ? "/tier/shared/abc123" : null,
                Map.of("templateTitle", "개발 언어 티어표"),
                LocalDateTime.now(),
                LocalDateTime.now(),
                shared ? LocalDateTime.now() : null
        );
    }
}
