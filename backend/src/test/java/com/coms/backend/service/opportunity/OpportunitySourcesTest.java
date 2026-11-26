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
    void boostcampFeedCollectsNewPreannouncementsAndFutureRecruitment() {
        String feed = """
                <rss><channel>
                  <item><title>부스트캠프 웹·모바일 11기 모집 예정 안내</title>
                    <link>https://blog.naver.com/boostcamp_official/999991?fromRss=true&amp;trackingCode=rss</link>
                    <pubDate>Sun, 22 Nov 2026 20:00:00 +0900</pubDate>
                    <description><![CDATA[<p>자세한 접수 일정은 추후 안내합니다.</p>]]></description>
                  </item>
                  <item><title>부스트캠프 AI Tech 9기 모집 안내</title>
                    <link>https://m.blog.naver.com/boostcamp_official/999992</link>
                    <pubDate>Mon, 23 Nov 2026 01:00:00 +0900</pubDate>
                    <description><![CDATA[<p>지원서 접수 기간</p><p>2026년 12월 1일 ~ 12월 10일 오전 11시</p>]]></description>
                  </item>
                  <item><title>부스트캠프 웹·모바일 11기 모집 예정 안내</title>
                    <link>https://blog.naver.com/boostcamp_official/999991</link>
                    <pubDate>Sun, 22 Nov 2026 20:00:00 +0900</pubDate>
                  </item>
                  <item><title>부스트캠프 웹·모바일 10기 모집 공고</title>
                    <link>https://blog.naver.com/boostcamp_official/999993</link>
                    <pubDate>Wed, 14 May 2025 11:59:35 +0900</pubDate>
                  </item>
                  <item><title>부스트캠프 AI Tech 8기 모집 설명회 다시보기</title>
                    <link>https://blog.naver.com/boostcamp_official/999994</link>
                    <pubDate>Sun, 22 Nov 2026 20:00:00 +0900</pubDate>
                  </item>
                  <item><title>부스트캠프 AI Tech 9기 모집 공고</title>
                    <link>https://blog.naver.com/other_account/999995</link>
                    <pubDate>Sun, 22 Nov 2026 20:00:00 +0900</pubDate>
                  </item>
                </channel></rss>
                """;

        List<OpportunityNotice> notices = OpportunitySources.parseBoostcamp(feed, LocalDate.of(2026, 11, 23));
        assertThat(notices).extracting(OpportunityNotice::externalId).containsExactly("999991", "999992");
        assertThat(notices.getFirst()).satisfies(notice -> {
            assertThat(notice.sourceKey()).isEqualTo("naver-boostcamp");
            assertThat(notice.sourceUrl()).isEqualTo("https://blog.naver.com/boostcamp_official/999991");
            assertThat(notice.applicationStart()).isNull();
            assertThat(notice.applicationEnd()).isNull();
            assertThat(notice.dateSnippet()).isNull();
        });
        assertThat(notices.getLast()).satisfies(notice -> {
            assertThat(notice.applicationStart()).isEqualTo("2026-12-01");
            assertThat(notice.applicationEnd()).isEqualTo("2026-12-10T11:00");
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

    @Test
    void devpostKeepsOpenOnlineHackathonsOnDevpostLinks() {
        LocalDate today = LocalDate.parse("2026-11-26");
        String api = """
                {"hackathons":[
                  {"id":1,"title":"Synthetic Online Jam","url":"https://synthetic-jam.devpost.com/","open_state":"open",
                   "invite_only":false,"displayed_location":{"location":"Online"},"submission_period_dates":"Oct 30 - Dec 04, 2026"},
                  {"id":2,"title":"Same Month","url":"https://same.devpost.com","open_state":"open",
                   "invite_only":false,"displayed_location":{"location":"Online"},"submission_period_dates":"Nov 11 - 30, 2026"},
                  {"id":3,"title":"In Person","url":"https://campus.devpost.com/","open_state":"open",
                   "invite_only":false,"displayed_location":{"location":"Durham University"},"submission_period_dates":"Nov 11 - 30, 2026"},
                  {"id":4,"title":"Invite Only","url":"https://invite.devpost.com/","open_state":"open",
                   "invite_only":true,"displayed_location":{"location":"Online"},"submission_period_dates":"Nov 11 - 30, 2026"},
                  {"id":5,"title":"Foreign Link","url":"https://example.com/devpost.com/","open_state":"open",
                   "invite_only":false,"displayed_location":{"location":"Online"},"submission_period_dates":"Nov 11 - 30, 2026"},
                  {"id":6,"title":"Already Over","url":"https://over.devpost.com/","open_state":"open",
                   "invite_only":false,"displayed_location":{"location":"Online"},"submission_period_dates":"Oct 01 - 20, 2026"}
                ]}
                """;
        var items = OpportunitySources.parseDevpost(api, today);
        assertThat(items).extracting(OpportunityNotice::externalId).containsExactly("1", "2");
        assertThat(items.getFirst()).satisfies(item -> {
            assertThat(item.category()).isEqualTo("HACKATHON");
            assertThat(item.sourceUrl()).isEqualTo("https://synthetic-jam.devpost.com/");
            assertThat(item.applicationStart()).isEqualTo("2026-10-30");
            assertThat(item.applicationEnd()).isEqualTo("2026-12-04");
        });
        assertThat(items.get(1).sourceUrl()).isEqualTo("https://same.devpost.com/");
        assertThat(OpportunitySources.devpostPeriod("Foo 30 - Dec 04, 2026")).isNull();
        assertThat(OpportunitySources.devpostPeriod("Nov 11, 2026 - Jan 11, 2027"))
                .isEqualTo(new OpportunityScheduleText.Dates("2026-11-11", "2027-01-11"));
        assertThat(OpportunitySources.devpostPeriod("Dec 20 - Jan 05, 2027"))
                .isEqualTo(new OpportunityScheduleText.Dates("2026-12-20", "2027-01-05"));
        assertThat(OpportunitySources.devpostPeriod("Feb 30 - Mar 02, 2027")).isNull();
        assertThat(OpportunitySources.devpostPeriod("Ongoing")).isNull();
    }

    @Test
    void wevityKeepsDeveloperContestsAndDerivesDeadlineFromDday() {
        LocalDate today = LocalDate.parse("2026-11-26");
        String list = """
                <ul class="list">
                  <li class="top"><div class="tit">공모전명</div></li>
                  <li><div class="tit"><a href="?c=find&s=1&gub=1&cidx=21&gbn=view&gp=1&ix=111884">2026 바이브코딩 해커톤 <span class='stat new'>신규</span></a></div>
                    <div class="day">D-10 <span class="dday ing">접수중</span></div></li>
                  <li><div class="tit"><a href="?c=find&s=1&gub=1&cidx=20&gbn=view&gp=1&ix=112565">제5회 AI 경진대회</a></div>
                    <div class="day">D-4 <span class="dday soon">마감임박</span></div></li>
                  <li><div class="tit"><a href="?c=find&s=1&gub=1&cidx=21&gbn=view&gp=1&ix=112600">AI 게임 개발 공모전</a></div>
                    <div class="day">D-40 <span class="dday future">접수예정</span></div></li>
                  <li><div class="tit"><a href="?c=find&s=1&gub=1&cidx=20&gbn=view&gp=1&ix=112700">영상처리 창업 해커톤</a></div>
                    <div class="day">D-DAY <span class="dday soon">마감임박</span></div></li>
                  <li><div class="tit"><a href="?c=find&s=1&gub=1&cidx=21&gbn=view&gp=1&ix=112700">영상처리 창업 해커톤</a></div>
                    <div class="day">D-DAY <span class="dday soon">마감임박</span></div></li>
                  <li><div class="tit"><a href="?c=find&s=1&gub=1&cidx=20&gbn=view&gp=1&ix=112589">AI 영상 공모전</a></div>
                    <div class="day">D-40 <span class="dday ing">접수중</span></div></li>
                  <li><div class="tit"><a href="?c=find&s=1&gub=1&cidx=20&gbn=view&gp=1&ix=112001">앱 개발 공모전</a></div>
                    <div class="day"><span class="dday end">마감</span></div></li>
                  <li><div class="tit"><a href="https://example.com/?ix=1">외부 해커톤</a></div>
                    <div class="day">D-3 <span class="dday ing">접수중</span></div></li>
                </ul>
                """;
        var items = OpportunitySources.parseWevity(Jsoup.parse(list), today);
        assertThat(items).extracting(OpportunityNotice::externalId)
                .containsExactly("111884", "112565", "112600", "112700", "112700");
        assertThat(items.get(3).category()).isEqualTo("HACKATHON");
        assertThat(items.get(3).applicationEnd()).isEqualTo("2026-11-26");
        assertThat(items.get(0)).satisfies(item -> {
            assertThat(item.title()).isEqualTo("2026 바이브코딩 해커톤");
            assertThat(item.category()).isEqualTo("HACKATHON");
            assertThat(item.sourceUrl()).isEqualTo("https://www.wevity.com/?c=find&s=1&gbn=view&ix=111884");
            assertThat(item.applicationEnd()).isEqualTo("2026-12-06");
        });
        assertThat(items.get(1).category()).isEqualTo("CONTEST");
        assertThat(items.get(1).applicationEnd()).isEqualTo("2026-11-30");
        assertThat(items.get(2).applicationEnd()).isNull();
    }
}
