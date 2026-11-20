package com.coms.backend.dto;

import java.util.List;

/** 역대 회장단 요청·응답 모음. */
public final class ClubOfficerDto {
    private ClubOfficerDto() {}

    /** 회원용. 명부 행을 연결해 둔 경우에만 generation 이 채워진다(학번·연락처는 내려가지 않는다). */
    public record OfficerView(Long id, String role, String name, String generation) {}

    public record TermView(Long id, String label, int year, int position, String note, List<OfficerView> officers) {}

    /** 관리자용. 연결된 명부 행의 id 와 이름까지 보여 준다. */
    public record AdminOfficerView(Long id, String role, String name, int position, Long eligibleMemberId,
                                   String eligibleMemberName, String generation) {}

    public record AdminTermView(Long id, String label, int year, int position, String note,
                                List<AdminOfficerView> officers) {}

    public record TermWrite(String label, Integer year, Integer position, String note) {}

    public record OfficerWrite(String role, String name) {}

    public record OrderWrite(List<Long> ids) {}

    /** eligibleMemberId 가 null 이면 연결을 푼다. */
    public record LinkWrite(Long eligibleMemberId) {}

    /** presidents / vices 는 이름 목록(중복 이름은 한 번만). */
    public record ImportRow(String label, Integer year, List<String> presidents, List<String> vices) {}

    public record ImportRequest(List<ImportRow> rows) {}

    public record ImportResult(int created, int updated, int unchanged) {}
}
