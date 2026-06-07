package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record SignupRequest(
        @NotBlank @Pattern(regexp = "\\d{10}", message = "학번은 숫자 10자리여야 합니다.") String studentId,
        @NotBlank @Pattern(regexp = "[가-힣]{3}", message = "이름은 한글 3자리여야 합니다.") String name,
        String graduateVerificationType,
        String graduateVerificationValue,
        @NotBlank @Email String email,
        @NotBlank @Pattern(
            regexp = "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?])(?!.*\\s).{8,}$",
            message = "비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 합니다."
        ) String password,
        String department,
        String phone,
        String aspiration,
        String interests,
        String signupType
) {}
