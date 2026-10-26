package com.coms.backend.service;

import com.coms.backend.dto.YouTubeSearchResponse;
import com.coms.backend.security.SlidingWindowRateLimiter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
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
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Thin adapter over the YouTube Data API used by the community rich-content editor to embed videos.
 * Self-contained: it depends only on the configured API key and an HTTP client, with no coupling to
 * community persistence.
 *
 * <p>One search costs 100 units of the project's default 10,000-unit daily quota, so roughly a
 * hundred searches a day exhaust it for everyone. Results are therefore cached per query, each
 * member gets an hourly allowance, the whole site a daily one that stays under the quota, and only
 * a few calls run at once so a slow API cannot tie up request threads.
 */
@Service
class YouTubeSearchService {
    private static final ObjectMapper JSON = new ObjectMapper();

    static final int MAX_SEARCHES_PER_MEMBER_PER_HOUR = 20;
    static final int MAX_SEARCHES_PER_DAY = 90;
    private static final int MAX_CONCURRENT_SEARCHES = 3;
    private static final Duration CACHE_TTL = Duration.ofHours(6);
    private static final int CACHE_MAX_ENTRIES = 200;
    private static final String SITE_KEY = "site";

    private final HttpClient httpClient;
    private final String youtubeApiKey;
    private final Clock clock;
    private final SlidingWindowRateLimiter searchesByMember;
    private final SlidingWindowRateLimiter searchesForSite;
    private final Semaphore inFlight = new Semaphore(MAX_CONCURRENT_SEARCHES);
    private final Map<String, CachedResult> cache = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, CachedResult> eldest) {
            return size() > CACHE_MAX_ENTRIES;
        }
    };

    private record CachedResult(YouTubeSearchResponse response, Instant expiresAt) {}

    @Autowired
    YouTubeSearchService(@Value("${youtube.api-key:}") String youtubeApiKey, Clock clock) {
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        this.youtubeApiKey = youtubeApiKey == null ? "" : youtubeApiKey.trim();
        this.clock = clock;
        this.searchesByMember = new SlidingWindowRateLimiter(MAX_SEARCHES_PER_MEMBER_PER_HOUR, Duration.ofHours(1), clock);
        this.searchesForSite = new SlidingWindowRateLimiter(MAX_SEARCHES_PER_DAY, Duration.ofDays(1), clock);
    }

    public YouTubeSearchResponse search(String studentId, String query) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.length() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "검색어를 2자 이상 입력해주세요.");
        }
        if (youtubeApiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "YouTube API 키가 설정되지 않았습니다.");
        }

        String cacheKey = trimmed.toLowerCase(Locale.ROOT);
        YouTubeSearchResponse cached = cached(cacheKey);
        if (cached != null) {
            return cached;
        }

        // A cache hit above is free; only real API calls count against the allowances.
        if (!searchesByMember.tryAcquire(studentId)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "YouTube 검색은 한 시간에 " + MAX_SEARCHES_PER_MEMBER_PER_HOUR + "번까지 할 수 있습니다. 잠시 후 다시 시도해주세요.");
        }
        if (!searchesForSite.tryAcquire(SITE_KEY)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "오늘 사이트 전체 YouTube 검색 한도를 모두 썼습니다. 내일 다시 시도하거나 영상 링크를 직접 붙여 넣어주세요.");
        }

        boolean acquired = false;
        try {
            acquired = inFlight.tryAcquire(2, TimeUnit.SECONDS);
            if (!acquired) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "YouTube 검색이 몰려 있습니다. 잠시 후 다시 시도해주세요.");
            }
            YouTubeSearchResponse response = fetch(trimmed);
            remember(cacheKey, response);
            return response;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "YouTube 검색에 실패했습니다.");
        } finally {
            if (acquired) {
                inFlight.release();
            }
        }
    }

    private YouTubeSearchResponse cached(String cacheKey) {
        synchronized (cache) {
            CachedResult entry = cache.get(cacheKey);
            if (entry == null) {
                return null;
            }
            if (!entry.expiresAt().isAfter(clock.instant())) {
                cache.remove(cacheKey);
                return null;
            }
            return entry.response();
        }
    }

    private void remember(String cacheKey, YouTubeSearchResponse response) {
        synchronized (cache) {
            cache.put(cacheKey, new CachedResult(response, clock.instant().plus(CACHE_TTL)));
        }
    }

    private YouTubeSearchResponse fetch(String query) {
        try {
            String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8);
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
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "YouTube 검색에 실패했습니다.");
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "YouTube 검색에 실패했습니다.");
        }
    }
}
