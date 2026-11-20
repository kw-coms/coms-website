package com.coms.backend.dto;

public record EligibleMemberImportResponse(
        int imported,
        int skipped,
        /** 이미 있던 행인데 전화번호가 비어 있어 파일의 번호로 채운 수. */
        int phoneFilled,
        /** 이미 있던 행인데 학부/학과가 비어 있어 파일의 값으로 채운 수. */
        int departmentFilled,
        /** 회장단 이력 칸이 500자를 넘어 그 값만 건너뛴 행 수(행 자체는 가져온다). */
        int officerHistoryTooLong,
        String message
) {}
