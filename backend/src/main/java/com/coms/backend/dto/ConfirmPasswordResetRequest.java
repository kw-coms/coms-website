package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ConfirmPasswordResetRequest(
        String studentId,
        @NotBlank @Email String email,
        @NotBlank
        @Pattern(regexp = "\\d{6}", message = "인증코드는 숫자 6자리여야 합니다.")
        String code,
        @NotBlank @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?])(?!.*\\s).{8,}$",
                message = "비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함하고 공백이 없어야 합니다."
        ) String newPassword
) {}
