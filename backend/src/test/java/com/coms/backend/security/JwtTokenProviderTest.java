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
        String sessionRefresh = provider.generateRefreshToken("2026123456", false);
        String rememberedRefresh = provider.generateRefreshToken("2026123456", true);

        assertThat(provider.isRememberedRefreshToken(sessionRefresh)).isFalse();
        assertThat(provider.isRememberedRefreshToken(rememberedRefresh)).isTrue();
    }
}
