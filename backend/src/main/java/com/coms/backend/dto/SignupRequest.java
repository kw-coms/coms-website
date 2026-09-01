package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record SignupRequest(
        String studentId,
        @NotBlank @Pattern(regexp = "[가-힣]{2,10}", message = "이름은 한글 2~10자여야 합니다.") String name,
        String graduateVerificationType,
        String graduateVerificationValue,
        @NotBlank @Email String email,
        @NotBlank @Pattern(
            regexp = "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?])(?!.*\\s).{8,}$",
            message = "비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 합니다."
        ) String password,
        String department,
        @Pattern(regexp = "\\d{1,3}", message = "기수는 숫자여야 합니다.") String generation,
        String phone,
        String aspiration,
        String interests,
        String signupType
) {}
