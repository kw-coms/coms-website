package com.coms.backend.service.opportunity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoField;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.coms.backend.service.opportunity.OpportunityScheduleText.*;

/** Built-in official sources. Public document data never controls the request host or path. */
@Component
public class OpportunitySources {
    public record Source(String key, String name, Supplier<List<OpportunityNotice>> fetch) {}

    private static final String CONTEST = "CONTEST";
    private static final String HACKATHON = "HACKATHON";
    private static final String TRAINING = "TRAINING";
    private static final String CF_NAME = "Codeforces";
    private static final String ATCODER_NAME = "AtCoder";
    private static final String ICPC_NAME = "ICPC Korea";
    private static final String KW_NAME = "광운대학교";
    private static final String SSAFY_NAME = "삼성청년SW·AI아카데미";
    private static final String SOMA_NAME = "AI·SW마에스트로";
    private static final String SESAC_NAME = "청년취업사관학교 새싹";
    private static final String BOOSTCAMP_KEY = "naver-boostcamp";
    private static final String BOOSTCAMP_NAME = "네이버 부스트캠프";
    private static final String DEVPOST_NAME = "Devpost";
    private static final String WEVITY_NAME = "위비티";

    private static final String CODEFORCES_API = "https://codeforces.com/api/contest.list?gym=false";
    private static final String ATCODER_PAGE = "https://atcoder.jp/contests/?lang=en";
    private static final String ICPC_RSS = "https://icpckorea.org/feed/";
    private static final String KW_DETAIL = "https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=";
    private static final String KW_LIST = "https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=list&searchKey=1&searchVal=%ED%95%B4%EC%BB%A4%ED%86%A4";
    private static final String SSAFY_BOARD = "https://www.ssafy.com/ksp/servlet/swp.board.controller.SwpBoardServlet";
    private static final String SSAFY_LIST = SSAFY_BOARD + "?p_menu_cd=M0501&p_process=select-board-list&p_tabseq=226504";
    private static final String SSAFY_DETAIL = SSAFY_BOARD + "?p_menu_cd=M0501&p_pageno=1&p_process=select-board-view&p_tabseq=226504&p_seq=";
    private static final String SOMA_PAGE = "https://www.swmaestro.ai/sw/main/notifyMentee.do?menuNo=200091";
    private static final String SESAC_LIST = "https://sesac.seoul.kr/sesac/course/offline/courseList.do?searchRcrtStts=RECRUITING&cPage=";
    private static final String SESAC_DETAIL = "https://sesac.seoul.kr/sesac/course/offline/courseDetail.do?crsSn=";
    private static final String BOOSTCAMP_BLOG = "https://blog.naver.com/boostcamp_official/";
    private static final String BOOSTCAMP_RSS = "https://rss.blog.naver.com/boostcamp_official.xml";
    private static final String RSS_ACCEPT = "application/rss+xml, application/xml, text/xml";
    private static final String DEVPOST_API = "https://devpost.com/api/hackathons?status%5B%5D=open&page=";
    private static final String WEVITY_LIST = "https://www.wevity.com/?c=find&s=1&gub=1&cidx=";
    private static final String WEVITY_DETAIL = "https://www.wevity.com/?c=find&s=1&gbn=view&ix=";
    // 20 = 웹/모바일/IT, 21 = 게임/소프트웨어
    private static final List<String> WEVITY_CATEGORIES = List.of("20", "21");
    private static final int DEVPOST_PAGES = 2;

    private static final Pattern ICPC_LINK = Pattern.compile("https://icpckorea\\.org/archives/([1-9]\\d{0,10})/?");
    private static final Pattern BOOSTCAMP_POST = Pattern.compile(
            "https://(?:m\\.)?blog\\.naver\\.com/boostcamp_official/([1-9]\\d{5,19})(?:\\?[^#]*)?");
    private static final Pattern BOOSTCAMP_RECRUITMENT = Pattern.compile(
            "모집|(?:지원서|서류)\\s*접수|지원\\s*(?:안내|일정|기간|마감)|설명회|알림\\s*신청");
    private static final Pattern BOOSTCAMP_OTHER = Pattern.compile(
            "다시\\s*보기|수료생|인터뷰|현장\\s*스케치|프리\\s*코스|스터디|가산점"
                    + "|시상식|기업\\s*파트너|파트너\\s*기업|채용\\s*공고|(?:모집|운영)\\s*(?:취소|중단)");
    private static final Pattern DEVPOST_LINK = Pattern.compile("https://([a-z0-9][a-z0-9-]{0,62})\\.devpost\\.com/?");
    private static final Pattern DEVPOST_PERIOD = Pattern.compile(
            "([A-Z][a-z]{2}) (\\d{1,2})(?:, (20\\d{2}))? - (?:([A-Z][a-z]{2}) )?(\\d{1,2}), (20\\d{2})");
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);
    private static final Pattern WEVITY_ID = Pattern.compile("\\?c=find&s=1&gub=1&cidx=\\d{1,3}&gbn=view(?:&gp=\\d{1,3})?&ix=([1-9]\\d{0,10})");
    private static final Pattern D_DAY = Pattern.compile("D-(\\d{1,3})(?!\\d)|D-?DAY", Pattern.CASE_INSENSITIVE);
    private static final Pattern HACKATHON_TITLE = Pattern.compile(
            "해커톤|해카톤|아이디어톤|프롬프톤|메이커톤|게임\\s*잼|hackathon|game\\s*jam", Pattern.CASE_INSENSITIVE);
    private static final Pattern DEVELOPER_TITLE = Pattern.compile(
            "개발|프로그래밍|코딩|소프트웨어|(?<![A-Za-z])SW(?![A-Za-z])|알고리즘|보안|데이터|경진대회|웹|앱",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_DEVELOPER_TITLE = Pattern.compile(
            "영상|광고|UCC|사진|미술|디자인|그래픽|시나리오|웹툰|문학|글쓰기|논문|교정|서포터즈|기자단|체험단|e-?스포츠|이스포츠|창업",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern ATCODER_PATH =Pattern.compile("/contests/([a-z0-9_-]{1,100})");
    private static final Pattern DUID = Pattern.compile("[?&]DUID=([1-9]\\d{0,10})(?:&|$)");
    private static final Pattern SSAFY_ID = Pattern.compile("javascript:goViewPage\\(([1-9]\\d{0,10})\\);?");
    private static final Pattern SESAC_ID = Pattern.compile("[?&]crsSn=([1-9]\\d{0,10})(?:&|$)");
    private static final Pattern DATE = Pattern.compile("(20[0-9]{2})[-.](\\d{1,2})[-.](\\d{1,2})");
    private static final Pattern YEAR = Pattern.compile("(?<![0-9])(20[0-9]{2})(?![0-9])");
    private static final Pattern COHORT = Pattern.compile("(\\d{1,3})\\s*기");
    private static final Pattern SESSION_LENGTH = Pattern.compile("(\\d{1,3}):([0-5]\\d)");
    private static final Pattern RESULTS = Pattern.compile(
            "수상|선정 결과|결과 발표|합격자|진출팀|명단|후기|심사위원|운영진 모집|스태프|멘토 모집"
            + "|scoreboard|solutions|dataset|photos|problemset|\\bresults?\\b|list of teams", Pattern.CASE_INSENSITIVE);
    private static final Pattern EVENT_NOTICE = Pattern.compile("모집|접수|등록|신청|참가|개최|일정|registration|schedule|mirror", Pattern.CASE_INSENSITIVE);
    private static final Pattern TECHNICAL_COURSE = Pattern.compile(
            "개발|백엔드|프론트엔드|풀스택|코딩|프로그래밍|엔지니어|클라우드|보안|데이터|인공지능|게임|웹|앱|AI|SW|AWS|DevOps",
            Pattern.CASE_INSENSITIVE);
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter SEOUL_MINUTE = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm").withZone(SEOUL);
    private static final DateTimeFormatter ATCODER_TIME = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ssxx");
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final int MAX_ITEMS = 60;
    private static final int MAX_DETAIL_REQUESTS = 4;
    private static final int MAX_SESAC_PAGES = 4;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public List<Source> sources() {
        return List.of(
                new Source("codeforces", CF_NAME, () -> parseCodeforces(download(CODEFORCES_API, "application/json"), Instant.now())),
                new Source("atcoder", ATCODER_NAME, () -> parseAtCoder(html(ATCODER_PAGE), Instant.now())),
                new Source("icpc-korea", ICPC_NAME, () -> parseIcpc(download(ICPC_RSS, RSS_ACCEPT), dateToday())),
                new Source("kw-hackathon", KW_NAME, this::kwHackathons),
                new Source("ssafy", SSAFY_NAME, this::ssafyRecruiting),
                new Source("sw-maestro", SOMA_NAME, () -> parseSoma(html(SOMA_PAGE))),
                new Source("sesac", SESAC_NAME, this::sesacCourses),
                new Source(BOOSTCAMP_KEY, BOOSTCAMP_NAME, () -> parseBoostcamp(download(BOOSTCAMP_RSS, RSS_ACCEPT), dateToday())),
                new Source("devpost", DEVPOST_NAME, this::devpostHackathons),
                new Source("wevity", WEVITY_NAME, this::wevityContests));
    }

    private List<OpportunityNotice> devpostHackathons() {
        List<OpportunityNotice> items = new ArrayList<>();
        for (int page = 1; page <= DEVPOST_PAGES; page++) {
            items.addAll(parseDevpost(download(DEVPOST_API + page, "application/json"), dateToday()));
        }
        return unique(items);
    }

    private List<OpportunityNotice> wevityContests() {
        List<OpportunityNotice> items = new ArrayList<>();
        for (String category : WEVITY_CATEGORIES) {
            items.addAll(parseWevity(html(WEVITY_LIST + category), dateToday()));
        }
        return unique(items);
    }

    private static List<OpportunityNotice> unique(List<OpportunityNotice> items) {
        Set<String> seen = new HashSet<>();
        return items.stream().filter(item -> seen.add(item.externalId())).limit(MAX_ITEMS).toList();
    }

    /** Open online Devpost hackathons. The link must stay on a devpost.com subdomain. */
    static List<OpportunityNotice> parseDevpost(String response, LocalDate today) {
        try {
            JsonNode rows = JSON.readTree(response).path("hackathons");
            if (!rows.isArray()) {
                throw unavailable();
            }
            List<OpportunityNotice> items = new ArrayList<>();
            for (JsonNode row : rows) {
                long id = row.path("id").asLong();
                Matcher link = DEVPOST_LINK.matcher(row.path("url").asText());
                if (id < 1 || !"open".equals(row.path("open_state").asText()) || row.path("invite_only").asBoolean(true)
                        || !"online".equalsIgnoreCase(row.path("displayed_location").path("location").asText())
                        || !link.matches()) {
                    continue;
                }
                Dates period = devpostPeriod(row.path("submission_period_dates").asText());
                if (period == null || LocalDate.parse(period.end()).isBefore(today)) {
                    continue;
                }
                add(items, notice("devpost", Long.toString(id), DEVPOST_NAME, "https://" + link.group(1) + ".devpost.com/",
                        HACKATHON, row.path("title").asText(), period, null, null));
            }
            return items;
        } catch (IOException invalidResponse) {
            throw unavailable();
        }
    }

    /** "Oct 30 - Dec 04, 2026", "Nov 11 - 30, 2026", "Nov 11, 2026 - Jan 11, 2027". */
    static Dates devpostPeriod(String text) {
        Matcher m = DEVPOST_PERIOD.matcher(text);
        if (!m.matches()) {
            return null;
        }
        try {
            int startMonth = MONTH.parse(m.group(1)).get(ChronoField.MONTH_OF_YEAR);
            int endMonth = m.group(4) == null ? startMonth : MONTH.parse(m.group(4)).get(ChronoField.MONTH_OF_YEAR);
            int endYear = Integer.parseInt(m.group(6));
            int startYear = m.group(3) != null ? Integer.parseInt(m.group(3)) : startMonth > endMonth ? endYear - 1 : endYear;
            LocalDate start = LocalDate.of(startYear, startMonth, Integer.parseInt(m.group(2)));
            LocalDate end = LocalDate.of(endYear, endMonth, Integer.parseInt(m.group(5)));
            return start.isAfter(end) ? null : new Dates(start.toString(), end.toString());
        } catch (DateTimeException invalidDate) {
            return null;
        }
    }

    /**
     * Developer contests from the wevity IT and software listings. The list only shows a D-day, so an open
     * listing gets a deadline of today + D and an upcoming one gets no dates for the reviewer to fill in.
     */
    static List<OpportunityNotice> parseWevity(Document page, LocalDate today) {
        if (page.selectFirst("ul.list") == null) {
            throw unavailable();
        }
        List<OpportunityNotice> items = new ArrayList<>();
        for (Element row : page.select("ul.list > li")) {
            Element link = row.selectFirst(".tit > a[href]");
            if (link == null) {
                continue;
            }
            Matcher id = WEVITY_ID.matcher(link.attr("href"));
            String title = titleWithout(link, ".stat");
            String state = text(row.selectFirst(".day .dday"));
            boolean hackathon = HACKATHON_TITLE.matcher(title).find();
            // A hackathon title wins over the exclusions ("영상처리 AI 해커톤", "창업 해커톤").
            if (!id.matches() || !(hackathon
                    || DEVELOPER_TITLE.matcher(title).find() && !NON_DEVELOPER_TITLE.matcher(title).find())) {
                continue;
            }
            Dates application = null;
            if (state.equals("접수중") || state.equals("마감임박")) {
                Matcher left = D_DAY.matcher(text(row.selectFirst(".day")));
                if (!left.find()) {
                    continue;
                }
                int days = left.group(1) == null ? 0 : Integer.parseInt(left.group(1));
                application = new Dates(null, today.plusDays(days).toString());
            } else if (!state.equals("접수예정")) {
                continue;
            }
            String category = hackathon ? HACKATHON : CONTEST;
            add(items, notice("wevity", id.group(1), WEVITY_NAME, WEVITY_DETAIL + id.group(1), category, title,
                    application, null, null));
            if (items.size() == MAX_ITEMS) {
                break;
            }
        }
        return items;
    }

    static List<OpportunityNotice> parseCodeforces(String response, Instant now) {
        try {
            JsonNode envelope = JSON.readTree(response);
            if (envelope == null || !"OK".equals(envelope.path("status").asText()) || !envelope.path("result").isArray()) {
                throw unavailable();
            }
            List<OpportunityNotice> items = new ArrayList<>();
            for (JsonNode row : envelope.path("result")) {
                long id = row.path("id").asLong();
                long duration = row.path("durationSeconds").asLong();
                long epoch = row.path("startTimeSeconds").asLong();
                if (!"BEFORE".equals(row.path("phase").asText()) || id < 1 || epoch < 1 || duration < 1 || duration > 2_592_000) {
                    continue;
                }
                Instant starts = Instant.ofEpochSecond(epoch);
                if (starts.isBefore(now.minus(Duration.ofHours(1))) || starts.isAfter(now.plus(Duration.ofDays(366)))) {
                    continue;
                }
                add(items, notice("codeforces", Long.toString(id), CF_NAME, "https://codeforces.com/contest/" + id, CONTEST,
                        row.path("name").asText(), null,
                        new Dates(SEOUL_MINUTE.format(starts), SEOUL_MINUTE.format(starts.plusSeconds(duration))), null));
                if (items.size() == MAX_ITEMS) {
                    break;
                }
            }
            return items;
        } catch (IOException | DateTimeException invalidResponse) {
            throw unavailable();
        }
    }

    static List<OpportunityNotice> parseAtCoder(Document page, Instant now) {
        if (page.selectFirst("#contest-table-upcoming, #contest-table-daily") == null) {
            throw unavailable();
        }
        List<OpportunityNotice> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Element row : page.select("#contest-table-upcoming tbody tr, #contest-table-daily tbody tr")) {
            var cells = row.select("> td");
            if (cells.size() < 3 || row.selectFirst("time") == null) {
                continue;
            }
            Element link = cells.get(1).selectFirst("a[href]");
            if (link == null) {
                continue;
            }
            Matcher path = ATCODER_PATH.matcher(link.attr("href"));
            Matcher length = SESSION_LENGTH.matcher(cells.get(2).text());
            if (!path.matches()) {
                continue;
            }
            try {
                Instant starts = OffsetDateTime.parse(row.selectFirst("time").text(), ATCODER_TIME).toInstant();
                if (starts.isBefore(now.minus(Duration.ofHours(1))) || starts.isAfter(now.plus(Duration.ofDays(366)))
                        || !seen.add(path.group(1))) {
                    continue;
                }
                String end = null;
                if (length.matches()) {
                    Duration duration = Duration.ofHours(Long.parseLong(length.group(1))).plusMinutes(Long.parseLong(length.group(2)));
                    end = SEOUL_MINUTE.format(starts.plus(duration));
                }
                add(items, notice("atcoder", path.group(1), ATCODER_NAME, "https://atcoder.jp" + path.group(0), CONTEST, link.text(),
                        null, new Dates(SEOUL_MINUTE.format(starts), end), null));
            } catch (DateTimeException malformedTime) {
                // An individual malformed calendar row should not prevent other rows from updating.
            }
            if (items.size() == MAX_ITEMS) {
                break;
            }
        }
        return items;
    }

    static List<OpportunityNotice> parseIcpc(String response, LocalDate today) {
        Document feed = Jsoup.parse(response, ICPC_RSS, Parser.xmlParser());
        if (feed.selectFirst("rss > channel") == null) {
            throw unavailable();
        }
        List<OpportunityNotice> items = new ArrayList<>();
        for (Element row : feed.select("channel > item")) {
            String title = text(row.selectFirst("title"));
            Matcher url = ICPC_LINK.matcher(text(row.selectFirst("link")));
            if (!url.matches() || RESULTS.matcher(title).find() || !EVENT_NOTICE.matcher(title).find()) {
                continue;
            }
            LocalDate publication = rssPublicationDate(row);
            if (publication == null || publication.isBefore(today.minusDays(120))) {
                continue;
            }
            Element body = row.selectFirst("content|encoded");
            if (body == null) {
                body = row.selectFirst("description");
            }
            List<String> schedule = body == null ? List.of() : lines(Jsoup.parseBodyFragment(body.wholeText()).body());
            add(items, fromText("icpc-korea", url.group(1), ICPC_NAME,
                    "https://icpckorea.org/archives/" + url.group(1) + "/", CONTEST, title, schedule, publication.getYear()));
            if (items.size() == MAX_ITEMS) {
                break;
            }
        }
        return items;
    }

    static List<OpportunityNotice> parseBoostcamp(String response, LocalDate today) {
        Document feed = Jsoup.parse(response, BOOSTCAMP_RSS, Parser.xmlParser());
        if (feed.selectFirst("rss > channel") == null) {
            throw unavailable();
        }
        List<OpportunityNotice> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Element row : feed.select("channel > item")) {
            String title = cleanTitle(text(row.selectFirst("title")));
            Matcher post = BOOSTCAMP_POST.matcher(text(row.selectFirst("link")));
            LocalDate publication = rssPublicationDate(row);
            if (title == null || !post.matches() || publication == null
                    || publication.isBefore(today.minusDays(120)) || publication.isAfter(today)
                    || !(title.contains("부스트캠프") || COHORT.matcher(title).find())
                    || !BOOSTCAMP_RECRUITMENT.matcher(title).find() || BOOSTCAMP_OTHER.matcher(title).find()
                    || RESULTS.matcher(title).find() || !seen.add(post.group(1))) {
                continue;
            }
            Element description = row.selectFirst("description");
            List<String> schedule = description == null ? List.of()
                    : lines(Jsoup.parseBodyFragment(description.wholeText()).body());
            // A newly posted notice can be reviewed even when the application schedule is not announced yet.
            add(items, fromText(BOOSTCAMP_KEY, post.group(1), BOOSTCAMP_NAME, BOOSTCAMP_BLOG + post.group(1),
                    TRAINING, title, schedule, publication.getYear()));
            if (items.size() == MAX_ITEMS) {
                break;
            }
        }
        return items;
    }

    private static LocalDate rssPublicationDate(Element row) {
        try {
            return OffsetDateTime.parse(text(row.selectFirst("pubDate")), DateTimeFormatter.RFC_1123_DATE_TIME)
                    .atZoneSameInstant(SEOUL).toLocalDate();
        } catch (DateTimeException invalidDate) {
            return null;
        }
    }

    private List<OpportunityNotice> kwHackathons() {
        Document listing = html(KW_LIST);
        if (listing.selectFirst(".board-list-box") == null) {
            throw unavailable();
        }
        List<OpportunityNotice> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int fetched = 0;
        for (Element link : listing.select(".board-list-box .board-text > a[href]")) {
            Matcher id = DUID.matcher(link.attr("href"));
            String title = cleanTitle(titleWithout(link, ".category"));
            if (!id.find() || title == null || !title.contains("해커톤")
                    || RESULTS.matcher(title).find() || !(EVENT_NOTICE.matcher(title).find() || title.contains("진행 안내"))
                    || !seen.add(id.group(1))) {
                continue;
            }
            LocalDate publication = firstDate(text(link.parent().selectFirst(".info")));
            if (publication == null || publication.isBefore(dateToday().minusDays(120))) {
                continue;
            }
            String url = KW_DETAIL + id.group(1);
            Element body = html(url).selectFirst(".board-view-box li.contents");
            if (body != null) {
                add(items, fromText("kw-hackathon", id.group(1), KW_NAME, url, HACKATHON, title, lines(body), publication.getYear()));
            }
            if (++fetched == MAX_DETAIL_REQUESTS) {
                break;
            }
        }
        return items;
    }

    private List<OpportunityNotice> ssafyRecruiting() {
        Document listing = html(SSAFY_LIST);
        if (listing.selectFirst("li .td.td1 a[href]") == null) {
            throw unavailable();
        }
        List<OpportunityNotice> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int fetched = 0;
        for (Element link : listing.select("li .td.td1 a[href]")) {
            Matcher id = SSAFY_ID.matcher(link.attr("href"));
            String title = titleWithout(link, ".ico_noti");
            if (!id.matches() || !COHORT.matcher(title).find() || !title.contains("모집")
                    || title.contains("설명회") || RESULTS.matcher(title).find() || !seen.add(id.group(1))) {
                continue;
            }
            LocalDate publication = firstDate(text(link.parent().parent().selectFirst(".td2")));
            if (publication == null || publication.isBefore(dateToday().minusDays(180))) {
                continue;
            }
            String url = SSAFY_DETAIL + id.group(1);
            Element body = html(url).selectFirst(".board_view .content");
            if (body != null) {
                add(items, fromText("ssafy", id.group(1), SSAFY_NAME, url, TRAINING, title, lines(body), publication.getYear()));
            }
            if (++fetched == MAX_DETAIL_REQUESTS) {
                break;
            }
        }
        return items;
    }

    static List<OpportunityNotice> parseSoma(Document page) {
        String title = text(page.selectFirst("h3.tit-page"));
        Matcher cohort = COHORT.matcher(title);
        if (!cohort.find() || !title.contains("연수생") || !title.contains("모집")) {
            throw unavailable();
        }
        Matcher year = YEAR.matcher(title);
        Integer reference = year.find() ? Integer.valueOf(year.group(1)) : null;
        List<OpportunityNotice> items = new ArrayList<>();
        for (Element heading : page.select(".group_com_w .group .f-col > b")) {
            if (!heading.text().replace(" ", "").equals("접수기간")) {
                continue;
            }
            for (Element row : heading.parent().select("li")) {
                String range = row.text();
                String center = range.contains("서울센터") ? "서울센터" : range.contains("부산센터") ? "부산센터" : null;
                int separator = range.indexOf(':');
                if (center == null || separator == -1) {
                    continue;
                }
                String id = cohort.group(1) + (center.equals("서울센터") ? "-seoul" : "-busan");
                add(items, fromText("sw-maestro", id, SOMA_NAME, SOMA_PAGE, TRAINING,
                        title + " · " + center, List.of("접수기간: " + range.substring(separator + 1)), reference));
            }
        }
        if (items.isEmpty()) {
            // Keep a plain review item so a format change cannot invent, overwrite, or publish dates.
            add(items, fromText("sw-maestro", cohort.group(1) + "-general", SOMA_NAME, SOMA_PAGE, TRAINING,
                    title, lines(page.selectFirst(".group_com_w")), reference));
        }
        return items;
    }

    private List<OpportunityNotice> sesacCourses() {
        List<OpportunityNotice> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (int page = 1; page <= MAX_SESAC_PAGES; page++) {
            Document listing = html(SESAC_LIST + page);
            if (listing.selectFirst(".list-wrap") == null) {
                throw unavailable();
            }
            for (OpportunityNotice notice : parseSesac(listing)) {
                if (seen.add(notice.externalId())) {
                    items.add(notice);
                }
            }
            if (listing.select("a.course-card-tracking").size() < 12 || items.size() >= MAX_ITEMS) {
                break;
            }
        }
        return items.stream().limit(MAX_ITEMS).toList();
    }

    static List<OpportunityNotice> parseSesac(Document page) {
        List<OpportunityNotice> items = new ArrayList<>();
        for (Element card : page.select("a.course-card-tracking[href]")) {
            Matcher id = SESAC_ID.matcher(card.attr("href"));
            String title = text(card.selectFirst(".tit"));
            if (!id.find() || !"모집중".equals(text(card.selectFirst(".clr01")))
                    || !TECHNICAL_COURSE.matcher(text(card.selectFirst(".clr03")) + " " + title).find()) {
                continue;
            }
            List<String> dates = card.select(".data-area dd").stream().map(Element::text)
                    .filter(value -> firstDate(value) != null).limit(1).map(line -> "모집기간: " + line).toList();
            add(items, fromText("sesac", id.group(1), SESAC_NAME, SESAC_DETAIL + id.group(1), TRAINING, title, dates, null));
        }
        return items;
    }

    private static OpportunityNotice fromText(String source, String id, String name, String url, String category,
                                              String title, List<String> text, Integer referenceYear) {
        Dates application = applicationDates(text, referenceYear);
        Dates event = eventDates(text, referenceYear);
        String snippet = application.end() == null ? applicationSnippet(text, referenceYear) : null;
        return notice(source, id, name, url, category, title, application, event, snippet);
    }

    private static OpportunityNotice notice(String source, String id, String name, String url, String category,
                                            String rawTitle, Dates application, Dates event, String snippet) {
        String title = cleanTitle(rawTitle);
        if (title == null) {
            return null;
        }
        return new OpportunityNotice(source, id, name, url, category, title,
                application == null ? null : application.start(), application == null ? null : application.end(),
                event == null ? null : event.start(), event == null ? null : event.end(), snippet);
    }

    private static void add(List<OpportunityNotice> items, OpportunityNotice candidate) {
        if (candidate != null) {
            items.add(candidate);
        }
    }

    private static String cleanTitle(String text) {
        String title = text.replaceAll("[\\p{Cc}\\p{Cf}]", " ").replaceAll("\\s+", " ").strip();
        if (title.isEmpty() || title.length() > 250 || looksLikeContact(title) || title.contains("://")) {
            return null;
        }
        return title;
    }

    private static String titleWithout(Element element, String selector) {
        Element clone = element.clone();
        clone.select(selector).remove();
        return clone.text();
    }

    private static String text(Element element) {
        return element == null ? "" : element.text();
    }

    private static LocalDate firstDate(String text) {
        Matcher date = DATE.matcher(text);
        if (!date.find()) {
            return null;
        }
        try {
            return LocalDate.of(Integer.parseInt(date.group(1)), Integer.parseInt(date.group(2)), Integer.parseInt(date.group(3)));
        } catch (DateTimeException invalidDate) {
            return null;
        }
    }

    private static LocalDate dateToday() {
        return LocalDate.now(SEOUL);
    }

    private Document html(String url) {
        return Jsoup.parse(download(url, "text/html, application/xhtml+xml"));
    }

    private String download(String url, String accept) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(9))
                .header("User-Agent", "COMs-Website/1.0 (+https://coms.kw.ac.kr)")
                .header("Accept", accept)
                .GET().build();
        var exchange = http.sendAsync(request, info -> new LimitedBody());
        try {
            HttpResponse<byte[]> response = exchange.get(10, TimeUnit.SECONDS);
            if (response.statusCode() != 200) {
                throw unavailable();
            }
            return new String(response.body(), StandardCharsets.UTF_8);
        } catch (InterruptedException interrupted) {
            exchange.cancel(true);
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (ExecutionException | TimeoutException unavailable) {
            exchange.cancel(true);
            throw unavailable();
        }
    }

    private static IllegalStateException unavailable() {
        return new IllegalStateException("공식 출처를 읽지 못했습니다.");
    }

    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;

        @Override
        public CompletionStage<byte[]> getBody() {
            return result;
        }

        @Override
        public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            subscription.request(1);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > MAX_RESPONSE_BYTES - bytes.size()) {
                    subscription.cancel();
                    result.completeExceptionally(unavailable());
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }

        @Override
        public void onError(Throwable error) {
            result.completeExceptionally(unavailable());
        }

        @Override
        public void onComplete() {
            result.complete(bytes.toByteArray());
        }
    }
}
