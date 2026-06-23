package com.coms.backend.service;

import com.coms.backend.dto.LinkPreviewResponse;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;

/**
 * Fetches and parses OpenGraph/meta metadata for a generic external URL so the editor can
 * render an OG-style link-preview card.
 *
 * <p><b>SSRF hardening</b> (the whole reason this lives server-side): the target URL is
 * attacker-controlled, so before any network call we
 * <ul>
 *   <li>require {@code https://} and a sane max length;</li>
 *   <li>resolve the host to IP(s) and reject if any resolves to a private / loopback /
 *       link-local / unique-local / cloud-metadata range (incl. 169.254.169.254 and
 *       IPv4-mapped IPv6 forms);</li>
 *   <li>disable redirect following ({@code Redirect.NEVER}) so a 302 to an internal host
 *       cannot bypass the guard;</li>
 *   <li>cap the timeout (~5s), the response body read (~256KB), and only parse when the
 *       response is {@code text/html}.</li>
 * </ul>
 * On any failure/guard-trip it returns a minimal fallback card ({@code title = host}) and
 * never leaks the internal error.
 */
@Service
public class LinkPreviewService {

    private static final int MAX_URL_LENGTH = 2048;
    private static final int MAX_BODY_BYTES = 256 * 1024;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final int MAX_TITLE_LENGTH = 160;
    private static final int MAX_DESCRIPTION_LENGTH = 280;
    private static final int MAX_SITE_NAME_LENGTH = 80;
    private static final String USER_AGENT =
            "Mozilla/5.0 (compatible; ComsLinkPreview/1.0; +https://coms.kw.ac.kr)";

    private final HttpClient httpClient;

    public LinkPreviewService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public LinkPreviewResponse preview(String rawUrl) {
        URI uri = parseAndValidate(rawUrl);
        String host = uri.getHost();
        String fallbackTitle = host == null ? "" : host;
        try {
            guardHost(host);
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(REQUEST_TIMEOUT)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "text/html,application/xhtml+xml")
                    .GET()
                    .build();
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() >= 300) {
                // We do not follow redirects; treat anything non-2xx as "no preview available".
                return fallback(rawUrl, fallbackTitle);
            }
            String contentType = response.headers().firstValue("Content-Type").orElse("");
            if (!contentType.toLowerCase(Locale.ROOT).contains("text/html")) {
                return fallback(rawUrl, fallbackTitle);
            }
            byte[] body = response.body();
            String html = new String(body, 0, Math.min(body.length, MAX_BODY_BYTES), StandardCharsets.UTF_8);
            return parse(rawUrl, host, html);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            // Timeout / connection / parse failure — never leak the internal error.
            return fallback(rawUrl, fallbackTitle);
        }
    }

    private URI parseAndValidate(String rawUrl) {
        String trimmed = rawUrl == null ? "" : rawUrl.trim();
        if (trimmed.isBlank() || trimmed.length() > MAX_URL_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "올바른 링크 주소가 아닙니다.");
        }
        URI uri;
        try {
            uri = URI.create(trimmed);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "올바른 링크 주소가 아닙니다.");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "링크 미리보기는 https 주소만 지원합니다.");
        }
        return uri;
    }

    /**
     * Resolves the host and rejects the request if ANY resolved address is in a
     * non-routable / internal range. A non-resolving host is also rejected.
     */
    private void guardHost(String host) {
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "링크 호스트를 확인할 수 없습니다.");
        }
        if (addresses.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "링크 호스트를 확인할 수 없습니다.");
        }
        for (InetAddress address : addresses) {
            if (isBlockedAddress(address)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "허용되지 않는 링크 주소입니다.");
            }
        }
    }

    /**
     * Returns true when the address is in a range that must never be fetched from a
     * server-side request: loopback, any-local (0.0.0.0 / ::), link-local (169.254/16,
     * fe80::/10, incl. the 169.254.169.254 metadata IP), site-local / private IPv4
     * (10/8, 172.16/12, 192.168/16), IPv4 0/8, and IPv6 unique-local (fc00::/7). Any
     * IPv4-mapped IPv6 address is unwrapped and re-checked against the IPv4 rules.
     */
    static boolean isBlockedAddress(InetAddress address) {
        if (address == null) {
            return true;
        }
        if (address.isLoopbackAddress() || address.isAnyLocalAddress()
                || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        byte[] bytes = address.getAddress();
        if (bytes.length == 16 && isIpv4Mapped(bytes)) {
            byte[] v4 = new byte[]{bytes[12], bytes[13], bytes[14], bytes[15]};
            return isBlockedIpv4(v4);
        }
        if (bytes.length == 4) {
            return isBlockedIpv4(bytes);
        }
        if (bytes.length == 16) {
            // IPv6 unique-local fc00::/7 (first 7 bits == 1111110). fe80::/10 link-local is
            // already covered by isLinkLocalAddress() above.
            return (bytes[0] & 0xFE) == 0xFC;
        }
        return true;
    }

    private static boolean isIpv4Mapped(byte[] b) {
        for (int i = 0; i < 10; i++) {
            if (b[i] != 0) return false;
        }
        return (b[10] & 0xFF) == 0xFF && (b[11] & 0xFF) == 0xFF;
    }

    private static boolean isBlockedIpv4(byte[] b) {
        int a = b[0] & 0xFF;
        int second = b[1] & 0xFF;
        if (a == 10) return true;                       // 10.0.0.0/8
        if (a == 127) return true;                      // 127.0.0.0/8 loopback
        if (a == 0) return true;                        // 0.0.0.0/8 "this network"
        if (a == 169 && second == 254) return true;     // 169.254.0.0/16 link-local + metadata
        if (a == 172 && second >= 16 && second <= 31) return true; // 172.16.0.0/12
        if (a == 192 && second == 168) return true;     // 192.168.0.0/16
        return false;
    }

    private LinkPreviewResponse parse(String url, String host, String html) {
        Document doc = Jsoup.parse(html, url);
        String title = firstNonBlank(
                metaContent(doc, "og:title"),
                doc.title(),
                host);
        String description = firstNonBlank(
                metaContent(doc, "og:description"),
                metaNameContent(doc, "description"),
                "");
        String siteName = firstNonBlank(
                metaContent(doc, "og:site_name"),
                host);
        String image = absoluteHttpsImage(doc, metaContent(doc, "og:image"));
        return new LinkPreviewResponse(
                url,
                truncate(title, MAX_TITLE_LENGTH),
                truncate(description, MAX_DESCRIPTION_LENGTH),
                image,
                truncate(siteName, MAX_SITE_NAME_LENGTH));
    }

    private LinkPreviewResponse fallback(String url, String host) {
        return new LinkPreviewResponse(url, truncate(host, MAX_TITLE_LENGTH), "", null, truncate(host, MAX_SITE_NAME_LENGTH));
    }

    private String metaContent(Document doc, String property) {
        Element el = doc.selectFirst("meta[property=" + property + "]");
        if (el == null) {
            el = doc.selectFirst("meta[name=" + property + "]");
        }
        return el == null ? "" : el.attr("content").trim();
    }

    private String metaNameContent(Document doc, String name) {
        Element el = doc.selectFirst("meta[name=" + name + "]");
        return el == null ? "" : el.attr("content").trim();
    }

    /**
     * Resolves the candidate image against the document base URL and only keeps it when the
     * result is an absolute https URL; otherwise returns null (the card renders imageless).
     */
    private String absoluteHttpsImage(Document doc, String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return null;
        }
        try {
            URI base = URI.create(doc.baseUri());
            URI resolved = base.resolve(candidate.trim());
            if ("https".equalsIgnoreCase(resolved.getScheme()) && resolved.getHost() != null) {
                String value = resolved.toString();
                return value.length() <= 500 ? value : null;
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private String truncate(String value, int maxLength) {
        if (value == null) return "";
        String normalized = value.replaceAll("\\s+", " ").trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }
}
