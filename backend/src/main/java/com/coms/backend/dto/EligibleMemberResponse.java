package com.coms.backend.dto;

public record EligibleMemberResponse(
    Long id,
    String studentId,
    String name,
    String generation,
    String phone,
    /** 이 명부 행으로 가입할 때 부여될 등급. 리크루팅 합격 이관 행만 ASSOCIATE(준회원). */
    String initialRole
) {}
