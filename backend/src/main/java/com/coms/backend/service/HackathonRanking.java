package com.coms.backend.service;

import com.coms.backend.domain.HackathonProject;
import com.coms.backend.domain.HackathonReview;
import com.coms.backend.dto.HackathonResultResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.ToIntFunction;

/**
 * 관리자 화면(src/features/hackathon/hackathon.ts summarizeHackathon)과 같은 규칙의 서버 계산.
 * 최종 점수 = 졸업생 평균 합계 50% + 회장 합계 50%, 동점은 완성도, 주제 적합성 순.
 * 작품마다 졸업생 평가와 회장 평가가 모두 있어야 순위를 매긴다(하나라도 없으면 빈 목록).
 */
final class HackathonRanking {
    private static final double EPSILON = 1e-9;

    private HackathonRanking() {}

    private record Row(HackathonProject project, int alumniCount, double alumniAverage, double chairScore,
                       double finalScore, double[] criteria) {}

    static List<HackathonResultResponse> rank(List<HackathonProject> projects, List<HackathonReview> reviews) {
        List<ToIntFunction<HackathonReview>> keys = List.of(HackathonReview::getThemeFit, HackathonReview::getCreativity,
                HackathonReview::getTechnology, HackathonReview::getCompleteness, HackathonReview::getPracticality);
        List<Row> rows = new ArrayList<>();
        for (HackathonProject project : projects) {
            List<HackathonReview> alumni = reviews.stream()
                    .filter(r -> r.getProjectId().equals(project.getId()) && !r.isChair()).toList();
            HackathonReview chair = reviews.stream()
                    .filter(r -> r.getProjectId().equals(project.getId()) && r.isChair()).findFirst().orElse(null);
            if (alumni.isEmpty() || chair == null) return List.of();
            double alumniAverage = alumni.stream().mapToInt(r -> total(keys, r)).average().orElseThrow();
            double chairScore = total(keys, chair);
            double[] criteria = new double[keys.size()];
            for (int i = 0; i < criteria.length; i++) {
                ToIntFunction<HackathonReview> key = keys.get(i);
                criteria[i] = (alumni.stream().mapToInt(key).average().orElseThrow() + key.applyAsInt(chair)) / 2;
            }
            rows.add(new Row(project, alumni.size(), alumniAverage, chairScore, (alumniAverage + chairScore) / 2, criteria));
        }
        Comparator<Row> compare = (a, b) -> {
            for (double[] pair : new double[][]{{b.finalScore, a.finalScore}, {b.criteria[3], a.criteria[3]}, {b.criteria[0], a.criteria[0]}}) {
                double difference = pair[0] - pair[1];
                if (Math.abs(difference) > EPSILON) return difference > 0 ? 1 : -1;
            }
            return 0;
        };
        rows.sort(compare);
        List<HackathonResultResponse> out = new ArrayList<>();
        int rank = 0;
        for (int i = 0; i < rows.size(); i++) {
            Row row = rows.get(i);
            if (i == 0 || compare.compare(rows.get(i - 1), row) != 0) rank = i + 1;
            out.add(new HackathonResultResponse(row.project.getId(), row.project.getTitle(), row.project.getAuthor(), rank,
                    round(row.finalScore), round(row.alumniAverage), round(row.chairScore), row.alumniCount,
                    new HackathonResultResponse.Criteria(round(row.criteria[0]), round(row.criteria[1]),
                            round(row.criteria[2]), round(row.criteria[3]), round(row.criteria[4]))));
        }
        return out;
    }

    private static int total(List<ToIntFunction<HackathonReview>> keys, HackathonReview review) {
        return keys.stream().mapToInt(key -> key.applyAsInt(review)).sum();
    }

    /** 화면의 toFixed(2)와 같은 값: 이진 표현의 정확한 값을 소수 둘째 자리에서 반올림한다. */
    static double round(double value) { return new BigDecimal(value).setScale(2, RoundingMode.HALF_UP).doubleValue(); }
}
