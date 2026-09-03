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
        String sessionRefresh = provider.generateRefreshToken("2026123456", false, 0, "aaa", "aaa");
        String rememberedRefresh = provider.generateRefreshToken("2026123456", true, 0, "bbb", "bbb");

        assertThat(provider.isRememberedRefreshToken(sessionRefresh)).isFalse();
        assertThat(provider.isRememberedRefreshToken(rememberedRefresh)).isTrue();
    }

    @Test
    void tokensCarryTokenVersion() {
        String access = provider.generateToken("2026123456", 3);
        String refresh = provider.generateRefreshToken("2026123456", false, 3, "ccc", "ccc");

        assertThat(provider.getTokenVersion(access)).isEqualTo(3);
        assertThat(provider.getTokenVersion(refresh)).isEqualTo(3);
    }

    @Test
    void refreshTokenCarriesItsSessionIdAndFamily() {
        String jti = JwtTokenProvider.newSessionId();
        String refresh = provider.generateRefreshToken("2026123456", false, 0, jti, "fam-1");

        assertThat(jti).matches("[0-9a-f]{32}");
        assertThat(provider.getSessionId(refresh)).isEqualTo(jti);
        assertThat(provider.getFamily(refresh)).isEqualTo("fam-1");
    }

    @Test
    void accessTokenCarriesTheFamilyOnlyWhenGivenOne() {
        assertThat(provider.getFamily(provider.generateToken("2026123456", 0, "fam-2"))).isEqualTo("fam-2");
        // Legacy shape: tokens minted before refresh sessions existed carry no family.
        assertThat(provider.getFamily(provider.generateToken("2026123456", 0))).isNull();
    }
}
