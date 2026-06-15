package com.coms.backend.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordPolicyDtoTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void adminPasswordResetAllowsSimpleTemporaryPassword() {
        var violations = validator.validate(new ResetPasswordRequest("temp1"));

        assertThat(violations).isEmpty();
    }

    @Test
    void adminPasswordResetStillRejectsBlankPassword() {
        var violations = validator.validate(new ResetPasswordRequest(" "));

        assertThat(violations).isNotEmpty();
    }

    @Test
    void signupStillRequiresComplexPassword() {
        var violations = validator.validate(new SignupRequest(
                "2024123456",
                "홍길동",
                null,
                null,
                "hong@example.com",
                "temp1",
                null,
                null,
                null,
                null,
                null
        ));

        assertThat(violations)
                .anySatisfy(violation -> assertThat(violation.getPropertyPath().toString()).isEqualTo("password"));
    }
}
