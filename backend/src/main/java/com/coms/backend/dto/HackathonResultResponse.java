package com.coms.backend.dto;

/** 공개용 최종 순위. 평가자 이름·의견은 담지 않는다. 점수는 20점 만점 5항목, 합계 100점. */
public record HackathonResultResponse(String projectId, String title, String author, int rank,
                                      double finalScore, double alumniAverage, double chairScore, int alumniCount,
                                      Criteria criteria) {
    /** 항목별 최종 점수 = (졸업생 평균 + 회장 점수) / 2. */
    public record Criteria(double themeFit, double creativity, double technology, double completeness, double practicality) {}
}
