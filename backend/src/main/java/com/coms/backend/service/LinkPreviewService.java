package com.coms.backend.service;

import com.coms.backend.dto.LinkPreviewResponse;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.net.ssl.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.List;
import java.util.Locale;

/**
 * Fetches and parses OpenGraph/meta metadata for a generic external URL so the editor can
 * render an OG-style link-preview card.
 *
 * <p><b>SSRF hardening</b>: the target URL is attacker-controlled, so before any network
 * call we:
 * <ul>
 *   <li>require {@code https://} and a sane max length;</li>
 *   <li>resolve the host to IP(s) <em>once</em> and reject if any resolves to a private /
 *       loopback / link-local / unique-local / cloud-metadata range;</li>
 *   <li><b>IP-pin the fetch</b>: rewrite the request URI to use the validated literal IP
 *       as the host, set {@code Host: <original-hostname>} for vhost routing, and configure
 *       SNI + endpoint-identification against the original hostname so TLS cert validation
 *       is correct — preventing DNS-rebinding TOCTOU where the resolver returns a public IP
 *       at guard time but a private IP at fetch time;</li>
 *   <li>disable redirect following ({@code Redirect.NEVER});</li>
 *   <li>cap the timeout (~5s), the response body read (~256KB), and only parse
 *       {@code text/html}.</li>
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
    private static final java.util.Set<Integer> ALLOWED_PORTS = java.util.Set.of(80, 443);
    private static final int MAX_PREVIEWS_PER_WINDOW = 20;
    private static final Duration PREVIEW_WINDOW = Duration.ofMinutes(1);

    // Sliding-window limiter keyed on the requesting member. Each preview is an outbound fetch
    // the caller chooses the target of, so an unthrottled endpoint lets one account use the
    // server as a request proxy / scanner. Same shape as the AuthService signup windows.
    private final java.util.Map<String, java.util.Deque<java.time.LocalDateTime>> previewsByMember =
            new java.util.concurrent.ConcurrentHashMap<>();
    private static final String USER_AGENT =
            "Mozilla/5.0 (compatible; ComsLinkPreview/1.0; +https://coms.kw.ac.kr)";

    public LinkPreviewResponse preview(String rawUrl, String memberStudentId) {
        enforcePreviewRateLimit(memberStudentId);
        return preview(rawUrl);
    }

    /** Rate limiter deliberately not applied here — go through {@link #preview(String, String)}. */
    private LinkPreviewResponse preview(String rawUrl) {
        URI uri = parseAndValidate(rawUrl);
        String host = uri.getHost();
        String fallbackTitle = host == null ? "" : host;
        try {
            // Resolve once, validate, pin — no second DNS lookup at fetch time.
            InetAddress validatedIp = resolveAndGuard(host);
            URI pinnedUri = buildPinnedUri(uri, validatedIp);

            HttpClient pinnedClient = buildPinnedClient(host);
            HttpRequest request = HttpRequest.newBuilder(pinnedUri)
                    .timeout(REQUEST_TIMEOUT)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "text/html,application/xhtml+xml")
                    .header("Host", host)   // vhost routing + correct absolute-URI rewrite
                    .GET()
                    .build();

            // Stream the body and stop reading at MAX_BODY_BYTES: ofByteArray() would buffer
            // an attacker-sized response entirely in heap before we could truncate it.
            HttpResponse<InputStream> response = pinnedClient.send(request,
                    HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream bodyStream = response.body()) {
                if (response.statusCode() >= 300) {
                    return fallback(rawUrl, fallbackTitle);
                }
                String contentType = response.headers().firstValue("Content-Type").orElse("");
                if (!contentType.toLowerCase(Locale.ROOT).contains("text/html")) {
                    return fallback(rawUrl, fallbackTitle);
                }
                byte[] body = readAtMost(bodyStream, MAX_BODY_BYTES);
                String html = new String(body, StandardCharsets.UTF_8);
                return parse(rawUrl, host, html);
            }
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            return fallback(rawUrl, fallbackTitle);
        }
    }

    /** Reads up to {@code maxBytes} from the stream and discards the rest without buffering it. */
    static byte[] readAtMost(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(maxBytes, 16 * 1024));
        byte[] buffer = new byte[8 * 1024];
        int remaining = maxBytes;
        while (remaining > 0) {
            int read = in.read(buffer, 0, Math.min(buffer.length, remaining));
            if (read < 0) {
                break;
            }
            out.write(buffer, 0, read);
            remaining -= read;
        }
        return out.toByteArray();
    }

    private void enforcePreviewRateLimit(String memberStudentId) {
        String key = memberStudentId == null || memberStudentId.isBlank() ? "unknown" : memberStudentId;
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        java.time.LocalDateTime cutoff = now.minus(PREVIEW_WINDOW);
        java.util.Deque<java.time.LocalDateTime> attempts =
                previewsByMember.computeIfAbsent(key, ignored -> new java.util.ArrayDeque<>());
        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) {
                attempts.removeFirst();
            }
            if (attempts.size() >= MAX_PREVIEWS_PER_WINDOW) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "링크 미리보기 요청이 많습니다. 잠시 후 다시 시도해주세요.");
            }
            attempts.addLast(now);
        }
        previewsByMember.entrySet().removeIf(entry -> {
            java.util.Deque<java.time.LocalDateTime> q = entry.getValue();
            synchronized (q) {
                return q.isEmpty() || q.peekLast().isBefore(cutoff);
            }
        });
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
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "링크 미리보기는 https 주소만 지원합니다.");
        }
        // An explicit port turns the preview into a port scanner for whatever the server can
        // reach: the response shape (fallback vs. parsed card, and how fast it comes back)
        // leaks whether something is listening. Only the standard web ports are allowed.
        int port = uri.getPort();
        if (port != -1 && !ALLOWED_PORTS.contains(port)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "링크 미리보기는 기본 웹 포트(80, 443)만 지원합니다.");
        }
        return uri;
    }

    /**
     * Resolves {@code host} to all its IPs (ONCE), rejects if any is in a blocked range,
     * and returns the first validated address for IP-pinning.
     *
     * <p>Callers <em>must</em> use the returned address as the connection target; no further
     * DNS resolution should occur for this request.
     */
    InetAddress resolveAndGuard(String host) {
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "링크 호스트를 확인할 수 없습니다.");
        }
        if (addresses == null || addresses.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "링크 호스트를 확인할 수 없습니다.");
        }
        for (InetAddress address : addresses) {
            if (isBlockedAddress(address)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "허용되지 않는 링크 주소입니다.");
            }
        }
        return addresses[0]; // first validated IP used for pinning
    }

    /**
     * Rewrites {@code original} URI so its host component is the <em>literal</em> IP address
     * string of {@code validatedIp}. Scheme, port, path, query, and fragment are preserved.
     *
     * <p>IPv6 literals are enclosed in brackets per RFC 2732/3986.
     *
     * <p>Package-private for unit testing.
     */
    static URI buildPinnedUri(URI original, InetAddress validatedIp) {
        String ipLiteral = validatedIp.getHostAddress();
        // IPv6 addresses in URIs must be bracket-wrapped (RFC 3986 §3.2.2).
        if (ipLiteral.contains(":")) {
            ipLiteral = "[" + ipLiteral + "]";
        }
        int port = original.getPort(); // -1 when not explicitly set
        String authority = port < 0 ? ipLiteral : ipLiteral + ":" + port;
        try {
            return new URI(
                    original.getScheme(),
                    authority,
                    original.getPath(),
                    original.getQuery(),
                    original.getFragment());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to build pinned URI", e);
        }
    }

    /**
     * Builds a single-use {@link HttpClient} whose TLS stack:
     * <ul>
     *   <li>sets SNI to {@code originalHost} so the server presents the correct certificate;</li>
     *   <li>keeps {@code endpointIdentificationAlgorithm = "HTTPS"} so the JVM verifies the
     *       cert's CN/SAN against {@code originalHost}, not the IP literal we dialled.</li>
     * </ul>
     * This is achieved via a delegating {@link X509ExtendedTrustManager} that wraps the
     * platform default and overrides the engine-based check to substitute the original hostname
     * before delegating to the standard PKIX validator.
     *
     * <p>Redirect following is disabled. Connect timeout is 3s.
     */
    private HttpClient buildPinnedClient(String originalHost) throws Exception {
        SSLContext pinnedCtx = buildSslContextWithSni(originalHost);
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .sslContext(pinnedCtx)
                .sslParameters(buildSslParams(originalHost))
                .build();
    }

    /**
     * Creates an {@link SSLContext} wrapping the default trust manager so that when
     * {@code java.net.http.HttpClient} performs endpoint identification it validates the
     * server certificate against {@code originalHost} rather than the IP address used in the
     * pinned URI. We do this by intercepting the engine-callback path: the custom
     * {@link X509ExtendedTrustManager} creates its own SSL engine pointing at
     * {@code originalHost} and delegates to the platform validator on that engine.
     */
    private static SSLContext buildSslContextWithSni(String originalHost)
            throws NoSuchAlgorithmException, KeyManagementException, KeyStoreException {

        // Platform default trust manager (PKIX).
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                TrustManagerFactory.getDefaultAlgorithm());
        tmf.init((KeyStore) null);
        X509ExtendedTrustManager platformTm = null;
        for (TrustManager tm : tmf.getTrustManagers()) {
            if (tm instanceof X509ExtendedTrustManager x) {
                platformTm = x;
                break;
            }
        }
        if (platformTm == null) {
            throw new IllegalStateException("No X509ExtendedTrustManager found");
        }

        // Delegating TM: all paths pass through to the platform TM. The engine-based
        // checkServerTrusted path is the one java.net.http uses when endpoint
        // identification is "HTTPS"; we supply an engine configured for originalHost
        // so the hostname check is against the real hostname, not the IP literal.
        final X509ExtendedTrustManager delegate = platformTm;
        X509ExtendedTrustManager hostnamePinned = new X509ExtendedTrustManager() {
            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType,
                                           SSLEngine engine) throws CertificateException {
                // Rebuild an engine targeting originalHost so PKIX hostname check is correct.
                SSLEngine hostEngine = rebuildEngineForHost(engine, originalHost);
                delegate.checkServerTrusted(chain, authType, hostEngine);
            }

            // Socket-based overloads — used by legacy JSSE paths, not by java.net.http.
            // @Override suppressed: javac anonymous-class erasure quirk when parent also
            // declares these; the intent is override, not overload.
            public void checkServerTrusted(X509Certificate[] chain, String authType,
                                           Socket socket) throws CertificateException {
                delegate.checkServerTrusted(chain, authType, socket);
            }

            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType)
                    throws CertificateException {
                delegate.checkClientTrusted(chain, authType);
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType)
                    throws CertificateException {
                delegate.checkServerTrusted(chain, authType);
            }

            // Socket-based overload — see note above.
            public void checkClientTrusted(X509Certificate[] chain, String authType,
                                           Socket socket) throws CertificateException {
                delegate.checkClientTrusted(chain, authType, socket);
            }

            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType,
                                           SSLEngine engine) throws CertificateException {
                delegate.checkClientTrusted(chain, authType, engine);
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return delegate.getAcceptedIssuers();
            }
        };

        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, new TrustManager[]{hostnamePinned}, null);
        return ctx;
    }

    /**
     * Creates a new {@link SSLEngine} whose peer host is set to {@code host} and whose
     * {@code endpointIdentificationAlgorithm} is {@code "HTTPS"}, so the delegating trust
     * manager validates the certificate hostname correctly.
     */
    private static SSLEngine rebuildEngineForHost(SSLEngine original, String host) {
        try {
            SSLContext ctx = SSLContext.getDefault();
            int port = original.getPeerPort();
            SSLEngine e = ctx.createSSLEngine(host, port < 0 ? 443 : port);
            SSLParameters params = e.getSSLParameters();
            params.setEndpointIdentificationAlgorithm("HTTPS");
            params.setServerNames(List.of(new SNIHostName(host)));
            e.setSSLParameters(params);
            e.setUseClientMode(true);
            return e;
        } catch (Exception ex) {
            throw new RuntimeException("Failed to rebuild SSL engine for host: " + host, ex);
        }
    }

    /**
     * Returns {@link SSLParameters} with SNI set to {@code originalHost} and endpoint
     * identification algorithm {@code "HTTPS"} (standard cert hostname check).
     */
    private static SSLParameters buildSslParams(String originalHost) {
        SSLParameters params = new SSLParameters();
        params.setEndpointIdentificationAlgorithm("HTTPS");
        params.setServerNames(List.of(new SNIHostName(originalHost)));
        return params;
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
        if (a == 10) return true;                            // 10.0.0.0/8
        if (a == 127) return true;                           // 127.0.0.0/8 loopback
        if (a == 0) return true;                             // 0.0.0.0/8 "this network"
        if (a == 169 && second == 254) return true;          // 169.254.0.0/16 link-local + metadata
        if (a == 172 && second >= 16 && second <= 31) return true; // 172.16.0.0/12
        if (a == 192 && second == 168) return true;          // 192.168.0.0/16
        if (a == 100 && second >= 64 && second <= 127) return true; // 100.64.0.0/10 CGNAT
        if (a == 192 && second == 0 && (b[2] & 0xFF) == 0) return true; // 192.0.0.0/24 IETF protocol assignments
        if (a == 198 && (second == 18 || second == 19)) return true;    // 198.18.0.0/15 benchmarking
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
        return new LinkPreviewResponse(url, truncate(host, MAX_TITLE_LENGTH), "", null,
                truncate(host, MAX_SITE_NAME_LENGTH));
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
