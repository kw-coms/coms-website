package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank @Pattern(regexp = "\\d{10}", message = "학번은 숫자 10자리여야 합니다.") String studentId,
        @NotBlank @Pattern(regexp = "[가-힣]{3}", message = "이름은 한글 3자리여야 합니다.") String name,
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8) String password,
        String department,
        String phone
) {}
