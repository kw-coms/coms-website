package com.coms.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClientIpResolverTest {
    private final ClientIpResolver resolver = new ClientIpResolver("127.0.0.1,172.18.0.1,::1");

    @Test
    void usesHostProxyRealIpInsteadOfSpoofableForwardedChain() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("172.18.0.1");
        request.addHeader("X-Forwarded-For", "198.51.100.1, 203.0.113.10");
        request.addHeader("X-Real-IP", "203.0.113.10");
        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.10");
    }

    @Test
    void ignoresHeadersFromUntrustedPeer() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113.20");
        request.addHeader("X-Real-IP", "198.51.100.1");
        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.20");
    }

    @Test
    void rejectsHostnamesAndFallsBackToImmediatePeer() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("172.18.0.1");
        request.addHeader("X-Real-IP", "attacker.example");
        assertThat(resolver.resolve(request)).isEqualTo("172.18.0.1");
        assertThatThrownBy(() -> new ClientIpResolver("attacker.example"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
