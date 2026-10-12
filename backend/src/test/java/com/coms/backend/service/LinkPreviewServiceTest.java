package com.coms.backend.service;

import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for SSRF guards and IP-pinning helpers in {@link LinkPreviewService}.
 *
 * No Spring context or network I/O is performed — InetAddress literals are resolved by the
 * JVM loopback resolver from the string form, and the request/response helpers work on bytes.
 */
class LinkPreviewServiceTest {

    private static InetAddress ip(String literal) throws UnknownHostException {
        return InetAddress.getByName(literal);
    }

    // ── isBlockedAddress ─────────────────────────────────────────────────────

    @Test
    void blocksLoopbackAddresses() throws Exception {
        assertThat(LinkPreviewService.isBlockedAddress(ip("127.0.0.1"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("::1"))).isTrue();
    }

    @Test
    void blocksPrivateRanges() throws Exception {
        assertThat(LinkPreviewService.isBlockedAddress(ip("10.0.0.1"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("172.16.5.4"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("172.31.255.255"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("192.168.1.1"))).isTrue();
    }

    @Test
    void blocksLinkLocalAndMetadataAddress() throws Exception {
        assertThat(LinkPreviewService.isBlockedAddress(ip("169.254.0.1"))).isTrue();
        // AWS / GCP / Azure cloud metadata endpoint
        assertThat(LinkPreviewService.isBlockedAddress(ip("169.254.169.254"))).isTrue();
    }

    @Test
    void blocksAnyLocalAndZeroNetwork() throws Exception {
        assertThat(LinkPreviewService.isBlockedAddress(ip("0.0.0.0"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("0.1.2.3"))).isTrue();
    }

    @Test
    void blocksIpv6UniqueLocalAndLinkLocal() throws Exception {
        assertThat(LinkPreviewService.isBlockedAddress(ip("fc00::1"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("fd12:3456:789a::1"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("fe80::1"))).isTrue();
    }

    @Test
    void blocksIpv4MappedPrivateAddress() throws Exception {
        // ::ffff:127.0.0.1 and ::ffff:10.0.0.1 must be unwrapped and blocked
        assertThat(LinkPreviewService.isBlockedAddress(ip("::ffff:127.0.0.1"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("::ffff:10.0.0.1"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("::ffff:169.254.169.254"))).isTrue();
    }

    @Test
    void allowsPublicAddresses() throws Exception {
        // Public, routable addresses (DNS-shape only — no actual fetch performed here).
        assertThat(LinkPreviewService.isBlockedAddress(ip("93.184.216.34"))).isFalse(); // example.com
        assertThat(LinkPreviewService.isBlockedAddress(ip("8.8.8.8"))).isFalse();
        assertThat(LinkPreviewService.isBlockedAddress(ip("1.1.1.1"))).isFalse();
        assertThat(LinkPreviewService.isBlockedAddress(ip("2606:2800:220:1:248:1893:25c8:1946"))).isFalse();
    }

    // ── buildPinnedUri (IP-pinning, DNS-rebinding fix) ───────────────────────

    // ── the request written to the pinned socket ─────────────────────────────

    @Test
    void requestNamesTheOriginalHostAndAsksForAnUncompressedSingleResponse() {
        String request = new String(LinkPreviewService.requestFor(URI.create("https://example.com/path/page?q=1&r=2#frag")),
                java.nio.charset.StandardCharsets.US_ASCII);

        assertThat(request).startsWith("GET /path/page?q=1&r=2 HTTP/1.1\r\n");
        // The socket goes to an IP address; this header is what routes the request to the site.
        assertThat(request).contains("\r\nHost: example.com\r\n");
        assertThat(request).contains("\r\nAccept-Encoding: identity\r\n");
        assertThat(request).contains("\r\nConnection: close\r\n");
        assertThat(request).endsWith("\r\n\r\n");
        assertThat(request).doesNotContain("#frag");
    }

    @Test
    void requestTargetIsAlwaysAsciiAndNeverEmpty() {
        assertThat(new String(LinkPreviewService.requestFor(URI.create("https://example.com")),
                java.nio.charset.StandardCharsets.US_ASCII)).startsWith("GET / HTTP/1.1\r\n");
        assertThat(new String(LinkPreviewService.requestFor(URI.create("https://example.com:443/a")),
                java.nio.charset.StandardCharsets.US_ASCII)).contains("\r\nHost: example.com:443\r\n");
        // java.net.URI accepts a raw Korean path; on the wire it must be percent-encoded UTF-8.
        assertThat(new String(LinkPreviewService.requestFor(URI.create("https://ko.wikipedia.org/wiki/광운대학교")),
                java.nio.charset.StandardCharsets.US_ASCII))
                .startsWith("GET /wiki/%EA%B4%91%EC%9A%B4%EB%8C%80%ED%95%99%EA%B5%90 HTTP/1.1\r\n");
    }

    // ── reading the response ─────────────────────────────────────────────────

    private static LinkPreviewService.FetchedPage read(String response, int maxBodyBytes) throws Exception {
        return LinkPreviewService.readResponse(
                new java.io.ByteArrayInputStream(response.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1)), maxBodyBytes);
    }

    @Test
    void readsABodyDelimitedByContentLength() throws Exception {
        var page = read("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: 5\r\n\r\nhelloEXTRA", 1024);

        assertThat(page.status()).isEqualTo(200);
        assertThat(page.isHtml()).isTrue();
        assertThat(page.charset()).isEqualTo("utf-8");
        assertThat(page.location()).isNull();
        assertThat(new String(page.body())).isEqualTo("hello");
    }

    @Test
    void readsAChunkedBodyAndABodyThatRunsToTheEndOfTheStream() throws Exception {
        var chunked = read("HTTP/1.1 200 OK\r\ncontent-type: TEXT/HTML\r\nTransfer-Encoding: chunked\r\n\r\n"
                + "5\r\nhello\r\n6;ext=1\r\n world\r\n0\r\n\r\n", 1024);
        assertThat(new String(chunked.body())).isEqualTo("hello world");
        assertThat(chunked.isHtml()).isTrue();
        assertThat(chunked.charset()).isNull();

        var untilClose = read("HTTP/1.0 200 OK\nContent-Type: text/html\n\n<title>x</title>", 1024);
        assertThat(new String(untilClose.body())).isEqualTo("<title>x</title>");
    }

    @Test
    void neverCollectsMoreThanTheBodyCap() throws Exception {
        assertThat(read("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 999999\r\n\r\n" + "a".repeat(5000), 100).body())
                .hasSize(100);
        assertThat(read("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n" + "a".repeat(5000), 100).body())
                .hasSize(100);
        assertThat(read("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n"
                + "40\r\n" + "a".repeat(64) + "\r\n40\r\n" + "b".repeat(64) + "\r\n0\r\n\r\n", 100).body())
                .hasSize(100);
    }

    @Test
    void reportsRedirectsWithoutReadingTheirBody() throws Exception {
        var redirect = read("HTTP/1.1 301 Moved Permanently\r\nLocation: https://www.example.com/\r\nContent-Length: 3\r\n\r\nabc", 1024);
        assertThat(redirect.status()).isEqualTo(301);
        assertThat(redirect.location()).isEqualTo("https://www.example.com/");
        assertThat(redirect.body()).isEmpty();

        // A 3xx with nowhere to go, and any other status, is simply "no page".
        assertThat(read("HTTP/1.1 302 Found\r\n\r\n", 1024).location()).isNull();
        var notFound = read("HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\nContent-Length: 3\r\n\r\nabc", 1024);
        assertThat(notFound.status()).isEqualTo(404);
        assertThat(notFound.body()).isEmpty();
    }

    @Test
    void rejectsWhatIsNotAnHttpResponse() {
        assertThatThrownBy(() -> read("SSH-2.0-OpenSSH_9.6\r\n", 1024)).isInstanceOf(java.io.IOException.class);
        assertThatThrownBy(() -> read("HTTP/1.1 abc OK\r\n\r\n", 1024)).isInstanceOf(java.io.IOException.class);
        assertThatThrownBy(() -> read("HTTP/1.1 200 OK\r\nContent-Type: text/html", 1024))
                .isInstanceOf(java.io.IOException.class);
        assertThatThrownBy(() -> read("HTTP/1.1 200 OK\r\nX-Long: " + "a".repeat(20_000) + "\r\n\r\n", 1024))
                .isInstanceOf(java.io.IOException.class);
        assertThatThrownBy(() -> read("HTTP/1.1 200 OK\r\n" + "X-H: 1\r\n".repeat(500) + "\r\n", 1024))
                .isInstanceOf(java.io.IOException.class);
        assertThatThrownBy(() -> read("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\n", 1024))
                .isInstanceOf(java.io.IOException.class);
    }

    @Test
    void ignoresACharsetTheJvmDoesNotKnow() throws Exception {
        assertThat(read("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=\"EUC-KR\"\r\n\r\n", 10).charset()).isEqualTo("EUC-KR");
        assertThat(read("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=no-such-charset\r\n\r\n", 10).charset()).isNull();
        assertThat(read("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n", 10).isHtml()).isFalse();
    }

    // ── resolveAndGuard: blocked host is rejected ────────────────────────────

    /**
     * A host that resolves to a private IP must be rejected by resolveAndGuard.
     * We use the loopback hostname "localhost" which always resolves to 127.0.0.1.
     */
    @Test
    void resolveAndGuardRejectsLocalhostHost() {
        LinkPreviewService svc = new LinkPreviewService();
        assertThatThrownBy(() -> svc.resolveAndGuard("localhost"))
                .hasMessageContaining("허용되지 않는 링크 주소입니다.");
    }

    @Test
    void resolveAndGuardRejectsNonResolvingHost() {
        LinkPreviewService svc = new LinkPreviewService();
        assertThatThrownBy(() -> svc.resolveAndGuard("this-host-does-not-exist.invalid"))
                .hasMessageContaining("링크 호스트를 확인할 수 없습니다.");
    }

    @Test
    void blocksCarrierGradeNatProtocolAndBenchmarkingRanges() throws Exception {
        // 100.64.0.0/10 — CGNAT, routable inside many hosting networks.
        assertThat(LinkPreviewService.isBlockedAddress(ip("100.64.0.1"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("100.127.255.255"))).isTrue();
        // 192.0.0.0/24 — IETF protocol assignments (incl. NAT64 discovery).
        assertThat(LinkPreviewService.isBlockedAddress(ip("192.0.0.1"))).isTrue();
        // 198.18.0.0/15 — benchmarking.
        assertThat(LinkPreviewService.isBlockedAddress(ip("198.18.0.1"))).isTrue();
        assertThat(LinkPreviewService.isBlockedAddress(ip("198.19.255.255"))).isTrue();

        // Neighbouring public addresses must stay reachable.
        assertThat(LinkPreviewService.isBlockedAddress(ip("100.63.255.255"))).isFalse();
        assertThat(LinkPreviewService.isBlockedAddress(ip("100.128.0.1"))).isFalse();
        assertThat(LinkPreviewService.isBlockedAddress(ip("192.0.1.1"))).isFalse();
        assertThat(LinkPreviewService.isBlockedAddress(ip("198.20.0.1"))).isFalse();
    }

    @Test
    void rejectsNonStandardPorts() {
        LinkPreviewService svc = new LinkPreviewService();
        // A preview against an arbitrary port is a port scan with the server as the scanner.
        assertThatThrownBy(() -> svc.preview("https://example.com:8080/", "2026123456"))
                .hasMessageContaining("기본 웹 포트");
        assertThatThrownBy(() -> svc.preview("https://example.com:22/", "2026123456"))
                .hasMessageContaining("기본 웹 포트");
    }

    @Test
    void limitsPreviewsPerMember() {
        LinkPreviewService svc = new LinkPreviewService();
        // 포트 검증에서 막히더라도 제한기는 그 앞에서 이미 요청을 셌다.
        for (int i = 0; i < 20; i++) {
            assertThatThrownBy(() -> svc.preview("https://example.com:8080/", "2026123456"))
                    .hasMessageContaining("기본 웹 포트");
        }
        assertThatThrownBy(() -> svc.preview("https://example.com:8080/", "2026123456"))
                .hasMessageContaining("링크 미리보기 요청이 많습니다");

        // 다른 회원은 자기 창을 가진다.
        assertThatThrownBy(() -> svc.preview("https://example.com:8080/", "2026123457"))
                .hasMessageContaining("기본 웹 포트");
    }

    // ---- the time limit is a wall-clock limit ---------------------------------------------------

    /**
     * A server that keeps the connection alive by sending one byte at a time. The socket read
     * timeout restarts with every byte and the TLS layer waits for a whole record, so nothing but
     * closing the socket ends this; before the hard stop the request thread stayed here for as
     * long as the server liked.
     */
    @Test
    void aTricklingServerCannotHoldTheFetchPastItsDeadline() throws Exception {
        try (java.net.ServerSocket server = new java.net.ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            Thread trickle = new Thread(() -> {
                try (java.net.Socket client = server.accept()) {
                    java.io.OutputStream out = client.getOutputStream();
                    // The start of a TLS handshake record announcing 16 KB that never arrives in full.
                    out.write(new byte[] {0x16, 0x03, 0x03, 0x40, 0x00});
                    out.flush();
                    while (true) {
                        Thread.sleep(150);
                        out.write(0);
                        out.flush();
                    }
                } catch (Exception closed) {
                    // The client went away, which is what the test waits for.
                }
            });
            trickle.setDaemon(true);
            trickle.start();

            LinkPreviewService service = new LinkPreviewService();
            java.net.URI uri = java.net.URI.create("https://preview.example:" + server.getLocalPort() + "/");
            long start = System.nanoTime();
            long deadline = start + java.time.Duration.ofMillis(700).toNanos();

            org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(java.time.Duration.ofSeconds(8), () ->
                    assertThatThrownBy(() -> service.fetch(uri, InetAddress.getLoopbackAddress(), deadline))
                            .isInstanceOf(java.io.IOException.class));

            assertThat(java.time.Duration.ofNanos(System.nanoTime() - start)).isLessThan(java.time.Duration.ofSeconds(4));
        }
    }

    // ── finalStatus: the status after redirects, under the preview's rules ───────

    /** A service whose fetches return canned pages and whose hosts all resolve to one public address. */
    private static LinkPreviewService canned(java.util.List<URI> asked, LinkPreviewService.FetchedPage... pages) {
        java.util.ArrayDeque<LinkPreviewService.FetchedPage> queue = new java.util.ArrayDeque<>(java.util.List.of(pages));
        return new LinkPreviewService() {
            @Override
            InetAddress resolveAndGuard(String host) {
                try {
                    return InetAddress.getByName("93.184.216.34");
                } catch (UnknownHostException impossible) {
                    throw new IllegalStateException(impossible);
                }
            }

            @Override
            FetchedPage fetch(URI uri, InetAddress address, long deadline) {
                asked.add(uri);
                return queue.size() > 1 ? queue.poll() : queue.peek();
            }
        };
    }

    private static LinkPreviewService.FetchedPage answered(int status) {
        return new LinkPreviewService.FetchedPage(status, "text/html", null, new byte[0]);
    }

    private static LinkPreviewService.FetchedPage redirected(String location) {
        return new LinkPreviewService.FetchedPage(301, "", location, new byte[0]);
    }

    @Test
    void finalStatusIsWhatTheAddressAnswersAfterItsRedirects() throws Exception {
        java.util.List<URI> asked = new java.util.ArrayList<>();
        assertThat(canned(asked, answered(200)).finalStatus("https://app.example/")).isEqualTo(200);
        assertThat(asked).containsExactly(URI.create("https://app.example/"));

        // A redirect is followed, relative ones against where it came from, and the last answer counts.
        asked.clear();
        LinkPreviewService moved = canned(asked, redirected("https://www.app.example/start"), redirected("/home"), answered(502));
        assertThat(moved.finalStatus("https://app.example/")).isEqualTo(502);
        assertThat(asked).containsExactly(
                URI.create("https://app.example/"),
                URI.create("https://www.app.example/start"),
                URI.create("https://www.app.example/home"));
    }

    @Test
    void finalStatusStopsFollowingAfterAFewRedirects() throws Exception {
        java.util.List<URI> asked = new java.util.ArrayList<>();
        LinkPreviewService looping = canned(asked, redirected("https://app.example/again"));
        assertThat(looping.finalStatus("https://app.example/")).isEqualTo(301);
        // The first request and three redirects, no more.
        assertThat(asked).hasSize(4);
    }

    @Test
    void finalStatusRefusesWhatAPreviewWouldRefuse() {
        java.util.List<URI> asked = new java.util.ArrayList<>();
        LinkPreviewService service = canned(asked, redirected("http://app.example/plain"), answered(200));
        assertThatThrownBy(() -> service.finalStatus("http://app.example/"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> service.finalStatus("https://app.example:8443/"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(asked).isEmpty();
        // A redirect down to plain http is refused too, after the one request that revealed it.
        assertThatThrownBy(() -> service.finalStatus("https://app.example/"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(asked).containsExactly(URI.create("https://app.example/"));
        // And the real guard still refuses a private address.
        assertThatThrownBy(() -> new LinkPreviewService().finalStatus("https://localhost/"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    @Test
    void requireResolvableOnlyAsksWhetherTheNameExists() throws Exception {
        LinkPreviewService service = new LinkPreviewService();
        // A private address resolves: judging it is the fetch's job, not this method's.
        service.requireResolvable("127.0.0.1");
        assertThatThrownBy(() -> service.requireResolvable("no-such-host.invalid"))
                .isInstanceOf(UnknownHostException.class);
    }
}
