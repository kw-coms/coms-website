package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AddEligibleMemberRequest(
        @NotBlank String name,
        String studentId,
        String admissionYear,
        String generation,
        String phone,
        @Size(max = 100) String department,
        @Email @Size(max = 255) String email,
        String officerHistory,
        /** 졸업생 등록 모드. 학번이 함께 오면 졸업생 규칙(졸업 연도·중복 검사)으로 등록한다. */
        Boolean graduate
) {}
