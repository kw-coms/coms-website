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
 * JVM loopback resolver from the string form, and buildPinnedUri is a pure URI rewrite.
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

    /**
     * Plain path: IPv4 address replaces the hostname in the URI; scheme/path/query preserved.
     * This verifies the TOCTOU fix — the URI used for the actual TCP connect is the literal IP,
     * not a hostname that could be re-resolved by the JVM or the HTTP client.
     */
    @Test
    void pinnedUriReplacesHostWithIpv4Literal() throws Exception {
        URI original = URI.create("https://example.com/path?q=1");
        InetAddress addr = ip("93.184.216.34");

        URI pinned = LinkPreviewService.buildPinnedUri(original, addr);

        assertThat(pinned.getScheme()).isEqualTo("https");
        assertThat(pinned.getHost()).isEqualTo("93.184.216.34");
        assertThat(pinned.getPath()).isEqualTo("/path");
        assertThat(pinned.getQuery()).isEqualTo("q=1");
        // No port was set in original, so pinned URI should also have no explicit port.
        assertThat(pinned.getPort()).isEqualTo(-1);
        // The literal must not be a resolvable hostname — it IS the IP.
        assertThat(pinned.toString()).startsWith("https://93.184.216.34/");
    }

    @Test
    void pinnedUriPreservesExplicitPort() throws Exception {
        URI original = URI.create("https://example.com:8443/secure");
        InetAddress addr = ip("93.184.216.34");

        URI pinned = LinkPreviewService.buildPinnedUri(original, addr);

        assertThat(pinned.getPort()).isEqualTo(8443);
        assertThat(pinned.toString()).startsWith("https://93.184.216.34:8443/");
    }

    @Test
    void pinnedUriEnclosesIpv6InBrackets() throws Exception {
        URI original = URI.create("https://example.com/ipv6path");
        // Use a public IPv6 address (example.com's AAAA record used in IANA assignments).
        InetAddress addr = ip("2606:2800:220:1:248:1893:25c8:1946");

        URI pinned = LinkPreviewService.buildPinnedUri(original, addr);

        // RFC 3986 §3.2.2 requires IPv6 literals in brackets.
        assertThat(pinned.toString()).contains("[2606:2800:220:1:248:1893:25c8:1946]");
        assertThat(pinned.getPath()).isEqualTo("/ipv6path");
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
}
