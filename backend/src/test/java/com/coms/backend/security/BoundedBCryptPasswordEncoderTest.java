package com.coms.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BoundedBCryptPasswordEncoderTest {

    private final BoundedBCryptPasswordEncoder encoder = new BoundedBCryptPasswordEncoder();

    @Test
    void encodesPasswordsUpToTheBcryptInputLimit() {
        String seventyTwoBytes = "a1!".repeat(24);

        String hash = encoder.encode(seventyTwoBytes);

        assertThat(encoder.matches(seventyTwoBytes, hash)).isTrue();
        assertThat(encoder.matches("a1!".repeat(23), hash)).isFalse();
    }

    @Test
    void longerInputIsReportedAsBadRequestWithUsableMessage() {
        assertThatThrownBy(() -> encoder.encode("a1!".repeat(24) + "x"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(ex.getReason()).contains("72");
                });
    }

    @Test
    void limitIsCountedInBytesNotCharacters() {
        // 25 Hangul syllables are only 25 characters but 75 UTF-8 bytes.
        assertThatThrownBy(() -> encoder.encode("가".repeat(25)))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(encoder.encode("가".repeat(24))).isNotBlank();
    }
}
