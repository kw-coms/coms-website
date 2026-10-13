package com.coms.backend.dto;

public record EligibleMemberImportResponse(
        int imported,
        int skipped,
        /** 이미 있던 행인데 전화번호가 비어 있어 파일의 번호로 채운 수. */
        int phoneFilled,
        String message
) {}
