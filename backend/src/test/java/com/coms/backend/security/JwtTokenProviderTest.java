package com.coms.backend.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class JwtTokenProviderTest {
    private final JwtTokenProvider provider = new JwtTokenProvider(
            "test-secret-key-with-at-least-32-characters",
            7_200_000
    );

    @Test
    void refreshTokenCarriesRememberChoice() {
        String sessionRefresh = provider.generateRefreshToken("2026123456", false, 0);
        String rememberedRefresh = provider.generateRefreshToken("2026123456", true, 0);

        assertThat(provider.isRememberedRefreshToken(sessionRefresh)).isFalse();
        assertThat(provider.isRememberedRefreshToken(rememberedRefresh)).isTrue();
    }

    @Test
    void tokensCarryTokenVersion() {
        String access = provider.generateToken("2026123456", 3);
        String refresh = provider.generateRefreshToken("2026123456", false, 3);

        assertThat(provider.getTokenVersion(access)).isEqualTo(3);
        assertThat(provider.getTokenVersion(refresh)).isEqualTo(3);
    }
}
