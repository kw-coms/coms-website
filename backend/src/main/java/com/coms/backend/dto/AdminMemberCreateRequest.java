package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AdminMemberCreateRequest(
        @NotBlank @Pattern(regexp = "\\d{10}", message = "학번은 숫자 10자리여야 합니다.") String studentId,
        @NotBlank @Pattern(regexp = "[가-힣]{2,10}", message = "이름은 한글 2~10자여야 합니다.") String name,
        @NotBlank @Email String email,
        @NotBlank @Size(max = 200) String password,
        @NotBlank @Pattern(regexp = "\\d{1,3}", message = "기수는 숫자여야 합니다.") String generation,
        @NotBlank String role,
        String department,
        String phone
) {
}
