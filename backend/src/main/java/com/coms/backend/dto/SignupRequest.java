package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The size limits mirror the {@code pending_signups} / {@code members} column widths. Without
 * them an over-long value passed validation and failed at the INSERT, which the client saw as
 * an unexplained HTTP 500 after filling in the whole form.
 */
public record SignupRequest(
        @Size(max = 20) String studentId,
        @NotBlank @Pattern(regexp = "[가-힣]{2,10}", message = "이름은 한글 2~10자여야 합니다.") String name,
        @Size(max = 20) String graduateVerificationType,
        @Size(max = 20) String graduateVerificationValue,
        @NotBlank @Email @Size(min = 1, max = 255) String email,
        @NotBlank @Pattern(
            regexp = "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?])(?!.*\\s).{8,}$",
            message = "비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 합니다."
        ) String password,
        @Size(max = 100) String department,
        @Pattern(regexp = "\\d{1,3}", message = "기수는 숫자여야 합니다.") String generation,
        @Size(max = 30) String phone,
        @Size(max = 2000) String aspiration,
        @Size(max = 500) String interests,
        @Size(max = 20) String signupType
) {}
