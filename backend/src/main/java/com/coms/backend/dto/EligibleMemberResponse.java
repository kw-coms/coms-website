package com.coms.backend.dto;

public record EligibleMemberResponse(
    Long id,
    String studentId,
    String name,
    String generation,
    /**
     * 입학연도. 졸업 여부 판정의 근거다. 명부에 직접 추가·가져오기한 행은 이 값을 들고 있지만,
     * 부트스트랩(MaintenanceController)이나 10자리가 아닌 학번으로 수정된 행은 null 일 수 있다.
     */
    Integer admissionYear,
    String phone,
    /** 이 명부 행으로 가입할 때 부여될 등급. 리크루팅 합격 이관 행만 ASSOCIATE(준회원). */
    String initialRole
) {}
