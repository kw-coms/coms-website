package com.coms.backend.service;

import com.coms.backend.dto.YouTubeSearchResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Thin adapter over the YouTube Data API used by the community rich-content editor to embed videos.
 * Self-contained: it depends only on the configured API key and an HTTP client, with no coupling to
 * community persistence.
 */
@Service
class YouTubeSearchService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final HttpClient httpClient;
    private final String youtubeApiKey;

    YouTubeSearchService(@Value("${youtube.api-key:}") String youtubeApiKey) {
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        this.youtubeApiKey = youtubeApiKey == null ? "" : youtubeApiKey.trim();
    }

    public YouTubeSearchResponse search(String query) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.length() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "검색어를 2자 이상 입력해주세요.");
        }
        if (youtubeApiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "YouTube API 키가 설정되지 않았습니다.");
        }
        try {
            String encoded = URLEncoder.encode(trimmed, StandardCharsets.UTF_8);
            URI uri = URI.create("https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=" + encoded);
            // The key travels in a header, not the query string: URLs end up in proxy access
            // logs, error reports and stack traces, which would leak the credential.
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(5))
                    .header("X-goog-api-key", youtubeApiKey)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "YouTube 검색 응답이 올바르지 않습니다.");
            }
            JsonNode root = JSON.readTree(response.body());
            List<YouTubeSearchResponse.Item> items = new ArrayList<>();
            for (JsonNode item : root.path("items")) {
                String videoId = item.path("id").path("videoId").asText("");
                if (videoId.isBlank()) continue;
                JsonNode snippet = item.path("snippet");
                String thumbnail = snippet.path("thumbnails").path("medium").path("url").asText(
                        snippet.path("thumbnails").path("default").path("url").asText(""));
                items.add(new YouTubeSearchResponse.Item(
                        videoId,
                        snippet.path("title").asText("YouTube video"),
                        thumbnail,
                        snippet.path("channelTitle").asText("")
                ));
            }
            return new YouTubeSearchResponse(items);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "YouTube 검색에 실패했습니다.");
        }
    }
}
