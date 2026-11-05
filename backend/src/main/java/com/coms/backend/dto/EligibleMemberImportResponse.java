package com.coms.backend.dto;

public record EligibleMemberImportResponse(
        int imported,
        int skipped,
        /** 이미 있던 행인데 전화번호가 비어 있어 파일의 번호로 채운 수. */
        int phoneFilled,
        /** 이미 있던 행인데 학부/학과가 비어 있어 파일의 값으로 채운 수. */
        int departmentFilled,
        String message
) {}
