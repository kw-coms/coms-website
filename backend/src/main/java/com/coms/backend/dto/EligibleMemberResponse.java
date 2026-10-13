package com.coms.backend.dto;

public record EligibleMemberResponse(
    Long id,
    String studentId,
    String name,
    String generation,
    /** 입학연도. 졸업 여부 판정의 근거 — 명부 행은 어느 경로로 만들어지든 이 값을 들고 있다. */
    Integer admissionYear,
    String phone,
    /** 이 명부 행으로 가입할 때 부여될 등급. 리크루팅 합격 이관 행만 ASSOCIATE(준회원). */
    String initialRole
) {}
