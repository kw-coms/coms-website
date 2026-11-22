package com.coms.backend.service.opportunity;

import org.jsoup.Jsoup;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OpportunitySourcesTest {
    @Test
    void structuredContestSourcesUseKoreanLocalTimesAndStableIds() {
        Instant today = Instant.parse("2026-11-23T00:00:00Z");
        String api = """
                {"status":"OK","result":[
                  {"id":123,"name":"Synthetic Contest","phase":"BEFORE","startTimeSeconds":%d,"durationSeconds":7200},
                  {"id":124,"name":"Old Contest","phase":"FINISHED","startTimeSeconds":%d,"durationSeconds":7200}
                ]}
                """.formatted(today.getEpochSecond(), today.getEpochSecond());
        assertThat(OpportunitySources.parseCodeforces(api, today)).singleElement().satisfies(item -> {
            assertThat(item.externalId()).isEqualTo("123");
            assertThat(item.eventStart()).isEqualTo("2026-11-23T09:00");
            assertThat(item.eventEnd()).isEqualTo("2026-11-23T11:00");
            assertThat(item.applicationEnd()).isNull();
            assertThat(item.dateSnippet()).isNull();
        });
        String calendar = """
                <div id="contest-table-upcoming"><table><tbody><tr>
                  <td><time>2026-11-28 21:00:00+0900</time></td>
                  <td><a href="/contests/mock01">Synthetic Beginner Contest</a></td><td>01:40</td>
                </tr><tr>
                  <td><time>2026-11-28 21:00:00+0900</time></td>
                  <td><a href="https://example.com/contests/nope">Untrusted link</a></td><td>01:40</td>
                </tr></tbody></table></div>
                """;
        assertThat(OpportunitySources.parseAtCoder(Jsoup.parse(calendar), today)).singleElement().satisfies(item -> {
            assertThat(item.sourceUrl()).isEqualTo("https://atcoder.jp/contests/mock01");
            assertThat(item.eventStart()).isEqualTo("2026-11-28T21:00");
            assertThat(item.eventEnd()).isEqualTo("2026-11-28T22:40");
            assertThat(item.dateSnippet()).isNull();
        });
    }

    @Test
    void icpcUsesOnlyRecentRecruitingOrScheduleNoticesFromOfficialLinks() {
        String feed = """
                <rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
                  <item><title>가상 프로그래밍 경시대회 참가 등록 안내</title>
                    <link>https://icpckorea.org/archives/123/</link>
                    <pubDate>Sun, 22 Nov 2026 20:00:00 +0900</pubDate>
                    <description>가상 대회에 참가하세요</description>
                    <content:encoded><![CDATA[<p>신청 기간</p><p>2026. 11. 25. ~ 12. 5.</p>]]></content:encoded>
                  </item>
                  <item><title>가상 프로그래밍 경시대회 결과 발표</title>
                    <link>https://icpckorea.org/archives/124/</link>
                    <pubDate>Sun, 22 Nov 2026 20:00:00 +0900</pubDate>
                  </item>
                  <item><title>가상 프로그래밍 경시대회 참가 등록 안내</title>
                    <link>https://example.com/archives/125/</link>
                    <pubDate>Sun, 22 Nov 2026 20:00:00 +0900</pubDate>
                  </item></channel></rss>
                """;
        assertThat(OpportunitySources.parseIcpc(feed, LocalDate.of(2026, 11, 23))).singleElement().satisfies(item -> {
            assertThat(item.externalId()).isEqualTo("123");
            assertThat(item.applicationStart()).isEqualTo("2026-11-25");
            assertThat(item.applicationEnd()).isEqualTo("2026-12-05");
            assertThat(item.dateSnippet()).isNull();
        });
    }

    @Test
    void officialTrainingParsersKeepSeparateCentersAndCanonicalCourseLinks() {
        String soma = """
                <h3 class="tit-page">2026년도 AI·SW마에스트로 제17기 연수생 모집 공고</h3>
                <div class="group_com_w"><div class="group"><div class="f-col"><b>접수 기간</b><ul>
                  <li>(1) 서울센터 : 2026. 1. 12.(월), 10:00 ∼ 2. 11.(수), 17:00</li>
                  <li>(2) 부산센터 : 2026. 2. 13.(금), 10:00 ∼ 3. 12.(목), 17:00</li>
                </ul></div></div></div>
                """;
        assertThat(OpportunitySources.parseSoma(Jsoup.parse(soma)))
                .extracting(OpportunityNotice::applicationEnd)
                .containsExactly("2026-02-11T17:00", "2026-03-12T17:00");
        String sesac = """
                <a class="course-card-tracking" href="/sesac/course/offline/courseDetail.do?crsSn=10&amp;cPage=4">
                  <p class="tit">가상 풀스택 과정</p><span class="clr01">모집중</span><span class="clr03">웹</span>
                  <div class="data-area"><dl><dd>2026.11.02 - 2026.12.06</dd></dl></div>
                </a>
                """;
        assertThat(OpportunitySources.parseSesac(Jsoup.parse(sesac))).singleElement().satisfies(item -> {
            assertThat(item.sourceUrl()).endsWith("?crsSn=10");
            assertThat(item.applicationEnd()).isEqualTo("2026-12-06");
            assertThat(item.eventStart()).isNull();
        });
    }

    @Test
    void applicationExtractionUsesLabelsAndOmitsProseFromModelSnippet() {
        List<String> schedule = List.of("행사 기간", "2026. 12. 15. ~ 12. 17.",
                "모집기간 : 2026년 11월 26일(목) 오전 9시부터 12월 9일(수) 오후 5시까지 담당 가상운영자",
                "지원 마감: 2026. 12. 10. 이메일 sample@example.com",
                "접수 기간: 2026. 12. 11. 전화 010-" + "0000-" + "0000",
                "합격자 발표: 2026. 12. 20.");
        String snippet = OpportunityScheduleText.applicationSnippet(schedule, 2026);
        assertThat(snippet).contains("2026", "오전", "오후", "9일")
                .doesNotContain("가상운영자", "sample", "0000", "12. 15.", "12. 20.");
        assertThat(OpportunityScheduleText.eventDates(schedule, 2026).end()).isEqualTo("2026-12-17");
        assertThat(OpportunityScheduleText.applicationDates(
                List.of("- 모집기간 : 2026년 10월 26일(월) ~ 11월 9일(월) 17시"), 2026).end())
                .isEqualTo("2026-11-09T17:00");
    }
}
