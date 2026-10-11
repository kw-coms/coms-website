package com.coms.backend.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;

/**
 * BCrypt only ever hashes the first 72 bytes of its input, and Spring Security refuses to encode
 * anything longer with an {@link IllegalArgumentException}. That exception reached clients as an
 * opaque HTTP 500 on signup, password change and password reset — a long passphrase from a
 * password manager, or about 25 Hangul characters, was enough to trigger it.
 *
 * <p>Every place that stores a password goes through the {@code PasswordEncoder} bean, so the limit
 * is enforced here once and reported as a normal validation error instead. (A wrapper rather than
 * a subclass: {@code BCryptPasswordEncoder.encode} is final.)
 */
public class BoundedBCryptPasswordEncoder implements PasswordEncoder {

    public static final int MAX_PASSWORD_BYTES = 72;
    public static final String TOO_LONG_MESSAGE =
            "비밀번호가 너무 깁니다. 영문·숫자 기준 72자(한글은 24자) 이내로 입력해주세요.";

    private final BCryptPasswordEncoder delegate = new BCryptPasswordEncoder();

    @Override
    public String encode(CharSequence rawPassword) {
        if (rawPassword != null
                && rawPassword.toString().getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, TOO_LONG_MESSAGE);
        }
        return delegate.encode(rawPassword);
    }

    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        return delegate.matches(rawPassword, encodedPassword);
    }

    @Override
    public boolean upgradeEncoding(String encodedPassword) {
        return delegate.upgradeEncoding(encodedPassword);
    }
}
