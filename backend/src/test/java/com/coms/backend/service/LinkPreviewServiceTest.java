package com.coms.backend.service;

import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.UnknownHostException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the SSRF guard that decides whether a resolved IP may be fetched
 * for a link preview. These exercise {@link LinkPreviewService#isBlockedAddress}
 * directly so no network I/O / Spring context is required.
 */
class LinkPreviewServiceTest {

    private static InetAddress ip(String literal) throws UnknownHostException {
        return InetAddress.getByName(literal);
    }

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
}
