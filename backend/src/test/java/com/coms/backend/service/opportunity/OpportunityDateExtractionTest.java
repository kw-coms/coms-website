package com.coms.backend.service.opportunity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OpportunityDateExtractionTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void projectsOnlyScheduleTermsAndDates() {
        var service = new OpportunityDateExtraction("", mock(HttpClient.class));
        String raw = """
                주제 임의문자열 직접 보여주지 않기
                담당자 테스트이름 생년월일 2001년 5월 2일
                접수기간: 2026. 11. 23.(월) ~ 12. 4.(금) 오후 5시
                문의 링크 https://example.com/private-data?birthday=2001-05-02
                대회 개최: 2026-12-12T14:00+09:00
                접수 마감 2026-12-10 01:00 UTC
                """;

        String projection = service.prepareSnippet(raw).orElseThrow();
        assertThat(projection).isEqualTo("""
                접수 기간 2026년 11월 23일 ~ 12월 4일 17:00
                대회 개최 2026년 12월 12일 14:00""");
        assertThat(projection).doesNotContain("테스트이름", "2001", "private-data", "임의문자열", "UTC");
        assertThat(service.prepareSnippet(projection)).contains(projection);
        assertThat(service.prepareSnippet("지원 마감 12월 5일 18:00")).isEmpty();
        assertThat(service.prepareSnippet("2026년 11월 23일 생성")).isEmpty();
        assertThat(service.prepareSnippet("지원 마감 2026년 2월 29일")).isEmpty();
    }

    @Test
    void disabledOrUnprojectedInputsNeverReachTheNetwork() {
        HttpClient http = mock(HttpClient.class);
        var disabled = new OpportunityDateExtraction(" ", http);
        var enabled = new OpportunityDateExtraction("test-value", http);

        assertThat(disabled.enabled()).isFalse();
        assertThat(disabled.extract("신청 2026년 11월 24일", "HACKATHON")).isEmpty();
        assertThat(enabled.extract("신청 2026년 11월 24일 테스트이름", "HACKATHON")).isEmpty();
        assertThat(enabled.extract("신청 2026년 11월 24일 ".repeat(500), "HACKATHON")).isEmpty();
        verifyNoInteractions(http);
    }

    @Test
    void sendsOneBoundedRequestAndAcceptsOnlyEvidencedDates() throws Exception {
        HttpClient http = mock(HttpClient.class);
        mockReply(http, 200, envelope("completed", "output_text", """
                {"applicationStart":"2026-11-23","applicationEnd":"2026-12-04T17:00","eventStart":"2026-12-12","eventEnd":null}
                """));
        var service = new OpportunityDateExtraction("test-value", http);
        String snippet = service.prepareSnippet("""
                접수 기간 2026.11.23 ~ 12.4 17:00
                대회 시작 2026.12.12
                """).orElseThrow();

        assertThat(service.extract(snippet, "CONTEST"))
                .contains(new OpportunityDateExtraction.Dates("2026-11-23", "2026-12-04T17:00", "2026-12-12", null));

        var captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).sendAsync(captor.capture(), any());
        HttpRequest request = captor.getValue();
        JsonNode payload = JSON.readTree(body(request));
        assertThat(request.uri()).isEqualTo(URI.create("https://api.openai.com/v1/responses"));
        assertThat(request.timeout()).contains(Duration.ofSeconds(12));
        assertThat(request.headers().firstValue("Authorization")).contains("Bearer test-value");
        assertThat(payload.path("input").textValue()).isEqualTo("Category: CONTEST\n" + snippet);
        assertThat(payload.path("store").isBoolean() && !payload.path("store").booleanValue()).isTrue();
        assertThat(payload.path("max_output_tokens").intValue()).isEqualTo(192);
        assertThat(payload.path("text").path("format").path("strict").booleanValue()).isTrue();
        assertThat(payload.has("tools")).isFalse();
    }

    @Test
    void rejectsInventedYearsDaysTimesAndReversedRanges() throws Exception {
        String[] modelReplies = {
                "{\"applicationStart\":null,\"applicationEnd\":\"2027-12-04T17:00\",\"eventStart\":null,\"eventEnd\":null}",
                "{\"applicationStart\":null,\"applicationEnd\":\"2026-12-05T17:00\",\"eventStart\":null,\"eventEnd\":null}",
                "{\"applicationStart\":null,\"applicationEnd\":\"2026-12-04T19:00\",\"eventStart\":null,\"eventEnd\":null}",
                "{\"applicationStart\":\"2026-12-04T17:00\",\"applicationEnd\":\"2026-11-23\",\"eventStart\":null,\"eventEnd\":null}",
                "{\"applicationStart\":null,\"applicationEnd\":\"2026-01-02\",\"eventStart\":null,\"eventEnd\":null}"
        };
        for (String modelReply : modelReplies) {
            HttpClient http = mock(HttpClient.class);
            mockReply(http, 200, envelope("completed", "output_text", modelReply));
            var service = new OpportunityDateExtraction("test-value", http);
            String snippet = service.prepareSnippet("""
                    접수 기간 2026년 11월 23일 ~ 12월 4일 17:00
                    행사 2026년 12월 30일 ~ 1월 2일
                    """).orElseThrow();

            assertThat(service.extract(snippet, "TRAINING")).isEmpty();
        }
    }

    @Test
    void providerFailureRefusalAndIncompleteOutputLeaveScheduleForReview() throws Exception {
        HttpClient http = mock(HttpClient.class);
        var service = new OpportunityDateExtraction("test-value", http);
        String snippet = service.prepareSnippet("신청 마감 2026년 11월 24일 18:30").orElseThrow();
        mockReply(http, 429, "{}");
        assertThat(service.extract(snippet, "TRAINING")).isEmpty();
        mockReply(http, 200, envelope("completed", "refusal", ""));
        assertThat(service.extract(snippet, "TRAINING")).isEmpty();
        mockReply(http, 200, envelope("incomplete", "output_text", "{}"));
        assertThat(service.extract(snippet, "TRAINING")).isEmpty();
        mockReply(http, 200, "not JSON");
        assertThat(service.extract(snippet, "TRAINING")).isEmpty();
    }

    private static String envelope(String status, String type, String text) throws Exception {
        return JSON.writeValueAsString(Map.of("status", status, "output", List.of(
                Map.of("type", "reasoning"),
                Map.of("type", "message", "role", "assistant", "content", List.of(Map.of("type", type, "text", text))))));
    }

    @SuppressWarnings("unchecked")
    private static void mockReply(HttpClient http, int status, String body) {
        HttpResponse<byte[]> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body.getBytes(StandardCharsets.UTF_8));
        when(http.<byte[]>sendAsync(any(HttpRequest.class), any())).thenReturn(CompletableFuture.completedFuture(response));
    }

    private static String body(HttpRequest request) {
        var data = new ByteArrayOutputStream();
        var finished = new CompletableFuture<String>();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer value) {
                byte[] bytes = new byte[value.remaining()];
                value.get(bytes);
                data.writeBytes(bytes);
            }

            @Override
            public void onError(Throwable error) {
                finished.completeExceptionally(error);
            }

            @Override
            public void onComplete() {
                finished.complete(data.toString(StandardCharsets.UTF_8));
            }
        });
        return finished.join();
    }
}
