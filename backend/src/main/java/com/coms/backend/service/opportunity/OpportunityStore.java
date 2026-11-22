package com.coms.backend.service.opportunity;

import com.coms.backend.dto.OpportunityDto.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class OpportunityStore {
    private static final int PAGE_SIZE = 30;
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final TypeReference<List<SourceReport>> REPORTS = new TypeReference<>() {};
    private static final Pattern CONTACT = Pattern.compile(
            "@|[0-9]{6}-?[1-4][0-9]{6}|(?<![0-9])(?:\\+?82[-. ]*)?0?[1-9][0-9]?[-. ][0-9]{3,4}[-. ][0-9]{4}(?![0-9])"
                    + "|(?<![0-9])(?:01[016789][0-9]{7,8}|(?:19|20)[0-9]{8})(?![0-9])|(?:이메일|연락처|담당자)\\s*[:：]");
    private static final Pattern DATE = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}(?:T[0-9]{2}:[0-9]{2})?");

    private final JdbcClient jdbc;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();

    public OpportunityStore(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    record Content(Category category, String title, String sourceName, String sourceUrl,
                   String applicationStart, String applicationEnd, String eventStart, String eventEnd) {}

    record Prepared(String sourceKey, String externalId, String fingerprint, Content content) {}

    Optional<Prepared> prepare(OpportunityNotice notice, String dateEvidence) {
        String title = safeTitle(notice.title());
        String url = notice.sourceUrl();
        if (title == null || !officialLink(url) || notice.sourceKey() == null || notice.sourceKey().length() > 50
                || notice.sourceName() == null || notice.sourceName().length() > 100
                || notice.externalId() == null || notice.externalId().isBlank() || notice.externalId().length() > 200) {
            return Optional.empty();
        }
        Content content = new Content(Category.valueOf(notice.category()), title, notice.sourceName(), url,
                date(notice.applicationStart()), date(notice.applicationEnd()), date(notice.eventStart()), date(notice.eventEnd()));
        if (!ordered(content.applicationStart(), content.applicationEnd()) || !ordered(content.eventStart(), content.eventEnd())) {
            return Optional.empty();
        }
        return Optional.of(new Prepared(notice.sourceKey(), notice.externalId(), sha256(encode(content) + "\n" + dateEvidence), content));
    }

    private static boolean officialLink(String value) {
        if (value == null || value.length() > 500) return false;
        try {
            URI link = URI.create(value);
            return "https".equals(link.getScheme()) && link.getHost() != null && link.getUserInfo() == null
                    && (link.getPort() == -1 || link.getPort() == 443);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static String safeTitle(String value) {
        if (value == null || value.length() > 2_000) return null;
        String title = Normalizer.normalize(value, Normalizer.Form.NFKC)
                .replaceAll("[\\p{Cc}\\p{Cf}]+", " ").replaceAll("\\s+", " ").strip();
        return title.isBlank() || title.length() > 250 || CONTACT.matcher(title).find() ? null : title;
    }

    private static String date(String value) {
        if (value == null || !DATE.matcher(value).matches()) return null;
        try {
            int year = LocalDate.parse(value.substring(0, 10)).getYear();
            if (year < 2000 || year > 2100) return null;
            if (value.length() > 10) LocalDateTime.parse(value);
            return value;
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static String reviewDate(String value) {
        if (value == null || value.isBlank()) return null;
        String valid = date(value);
        if (valid == null) throw badRequest("일정 날짜나 시각을 확인해 주세요.");
        return valid;
    }

    private static boolean ordered(String start, String end) {
        if (start == null || end == null) return true;
        LocalDateTime from = start.length() == 10 ? LocalDate.parse(start).atStartOfDay() : LocalDateTime.parse(start);
        LocalDateTime to = end.length() == 10 ? LocalDate.parse(end).atTime(LocalTime.MAX) : LocalDateTime.parse(end);
        return !from.isAfter(to);
    }

    static Content fillDates(Content content, OpportunityDateExtraction.Dates suggestion) {
        String appStart = first(content.applicationStart(), date(suggestion.applicationStart()));
        String appEnd = first(content.applicationEnd(), date(suggestion.applicationEnd()));
        String eventStart = first(content.eventStart(), date(suggestion.eventStart()));
        String eventEnd = first(content.eventEnd(), date(suggestion.eventEnd()));
        boolean appValid = ordered(appStart, appEnd);
        boolean eventValid = ordered(eventStart, eventEnd);
        return new Content(content.category(), content.title(), content.sourceName(), content.sourceUrl(),
                appValid ? appStart : content.applicationStart(), appValid ? appEnd : content.applicationEnd(),
                eventValid ? eventStart : content.eventStart(), eventValid ? eventEnd : content.eventEnd());
    }

    private static String first(String known, String fallback) {
        return known != null ? known : fallback;
    }

    boolean unchanged(Prepared notice) {
        return lookup(notice, false).map(r -> r.fingerprint().equals(notice.fingerprint())).orElse(false);
    }

    @Transactional
    public boolean saveCollected(Prepared notice, Content content) {
        Optional<Row> existing = lookup(notice, true);
        boolean assisted = !notice.content().equals(content);
        String data = encode(content);
        if (existing.isEmpty()) {
            jdbc.sql("""
                    INSERT INTO external_opportunities
                        (source_key, external_id, source_fingerprint, draft_json, collected_at, status, ai_assisted)
                    VALUES (:source, :external, :fingerprint, :draft, :now, 'PENDING', :assisted)
                    """).param("source", notice.sourceKey()).param("external", notice.externalId())
                    .param("fingerprint", notice.fingerprint()).param("draft", data)
                    .param("now", now()).param("assisted", assisted).update();
            return true;
        }
        Row row = existing.get();
        if (row.fingerprint().equals(notice.fingerprint())) return false;
        jdbc.sql("""
                UPDATE external_opportunities SET source_fingerprint = :fingerprint, draft_json = :draft,
                    collected_at = :now, status = 'PENDING', ai_assisted = :assisted, version = version + 1
                WHERE id = :id
                """).param("fingerprint", notice.fingerprint()).param("draft", data)
                .param("now", now()).param("assisted", assisted).param("id", row.id()).update();
        return true;
    }

    private Optional<Row> lookup(Prepared notice, boolean lock) {
        return jdbc.sql("SELECT * FROM external_opportunities WHERE source_key = :source AND external_id = :external"
                        + (lock ? " FOR UPDATE" : ""))
                .param("source", notice.sourceKey()).param("external", notice.externalId()).query(this::map).optional();
    }

    public List<Published> published() {
        return jdbc.sql("""
                SELECT id, published_json, published_at FROM external_opportunities WHERE published_at IS NOT NULL
                ORDER BY published_at DESC, id DESC LIMIT 200
                """).query((rs, n) -> {
            Content p = decode(rs.getString("published_json"));
            return new Published(rs.getLong("id"), p.category(), p.title(), p.sourceName(), p.sourceUrl(),
                    p.applicationStart(), p.applicationEnd(), p.eventStart(), p.eventEnd(),
                    rs.getObject("published_at", OffsetDateTime.class));
        }).list();
    }

    @Transactional(readOnly = true)
    public Candidates candidates(Status status, int page) {
        if (page < 0 || page > 10_000) throw badRequest("페이지 번호를 확인해 주세요.");
        String condition = status == Status.PUBLISHED ? "published_at IS NOT NULL" : "status = :status";
        var countQuery = jdbc.sql("SELECT COUNT(*) FROM external_opportunities WHERE " + condition);
        var pageQuery = jdbc.sql("SELECT * FROM external_opportunities WHERE " + condition
                + " ORDER BY collected_at DESC, id DESC LIMIT :limit OFFSET :offset");
        if (status != Status.PUBLISHED) {
            countQuery.param("status", status.name());
            pageQuery.param("status", status.name());
        }
        long total = countQuery.query(Long.class).single();
        List<Candidate> rows = pageQuery.param("limit", PAGE_SIZE).param("offset", page * PAGE_SIZE)
                .query(this::map).list().stream().map(Row::candidate).toList();
        return new Candidates(rows, total, page, PAGE_SIZE);
    }

    @Transactional
    public Candidate review(long id, Review request) {
        if (request == null || request.version() == null || request.action() == null) {
            throw badRequest("검토 처리 정보를 확인해 주세요.");
        }
        Row row = require(id, true);
        if (row.version() != request.version()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "공고가 변경되었습니다. 새로고침하고 다시 확인해 주세요.");
        }
        switch (request.action()) {
            case PUBLISH -> publish(row, request);
            case IGNORE -> jdbc.sql("""
                    UPDATE external_opportunities SET status = 'IGNORED', version = version + 1 WHERE id = :id
                    """).param("id", id).update();
            case UNPUBLISH -> jdbc.sql("""
                    UPDATE external_opportunities SET status = 'IGNORED', published_json = NULL, published_at = NULL,
                        version = version + 1 WHERE id = :id
                    """).param("id", id).update();
        }
        return require(id, false).candidate();
    }

    private void publish(Row row, Review request) {
        String title = safeTitle(request.title());
        if (title == null || request.category() == null) {
            throw badRequest("제목(250자 이하)과 유형을 입력해 주세요. 개인 연락처나 식별번호는 사용할 수 없습니다.");
        }
        Content content = new Content(request.category(), title, row.draft().sourceName(), row.draft().sourceUrl(),
                reviewDate(request.applicationStart()), reviewDate(request.applicationEnd()),
                reviewDate(request.eventStart()), reviewDate(request.eventEnd()));
        if (!ordered(content.applicationStart(), content.applicationEnd()) || !ordered(content.eventStart(), content.eventEnd())) {
            throw badRequest("시작 시각은 마감 시각보다 늦을 수 없습니다.");
        }
        String data = encode(content);
        jdbc.sql("""
                UPDATE external_opportunities SET draft_json = :data, published_json = :data, published_at = :now,
                    status = 'PUBLISHED', version = version + 1 WHERE id = :id
                """).param("data", data).param("now", now()).param("id", row.id()).update();
    }

    private Row require(long id, boolean lock) {
        return jdbc.sql("SELECT * FROM external_opportunities WHERE id = :id" + (lock ? " FOR UPDATE" : ""))
                .param("id", id).query(this::map).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "공고를 찾을 수 없습니다."));
    }

    private record Row(long id, long version, Status status, boolean aiAssisted, String fingerprint,
                       OffsetDateTime collectedAt, OffsetDateTime publishedAt, Content draft) {
        Candidate candidate() {
            return new Candidate(id, draft.category(), draft.title(), draft.sourceName(), draft.sourceUrl(),
                    draft.applicationStart(), draft.applicationEnd(), draft.eventStart(), draft.eventEnd(), publishedAt,
                    status, version, collectedAt, publishedAt != null, aiAssisted);
        }
    }

    private Row map(ResultSet rs, int ignored) throws SQLException {
        return new Row(rs.getLong("id"), rs.getLong("version"), Status.valueOf(rs.getString("status")),
                rs.getBoolean("ai_assisted"), rs.getString("source_fingerprint"),
                rs.getObject("collected_at", OffsetDateTime.class), rs.getObject("published_at", OffsetDateTime.class),
                decode(rs.getString("draft_json")));
    }

    public CollectionStatus collectionStatus(boolean enabled) {
        return jdbc.sql("SELECT lease_until, last_run_at, source_report_json FROM external_opportunity_collection WHERE id = 1")
                .query((rs, n) -> {
                    OffsetDateTime until = rs.getObject("lease_until", OffsetDateTime.class);
                    return new CollectionStatus(enabled, until != null && until.isAfter(now()),
                            rs.getObject("last_run_at", OffsetDateTime.class), reports(rs.getString("source_report_json")));
                }).single();
    }

    boolean acquire(String lease) {
        OffsetDateTime now = now();
        return jdbc.sql("""
                UPDATE external_opportunity_collection
                   SET lease_token = :lease, lease_until = :until, next_at = :next
                 WHERE id = 1 AND (lease_until IS NULL OR lease_until <= :now) AND (next_at IS NULL OR next_at <= :now)
                """).param("lease", lease).param("until", now.plusMinutes(15)).param("next", now.plusMinutes(15))
                .param("now", now).update() == 1;
    }

    boolean claimAiAttempt(String lease, int limit) {
        LocalDate day = LocalDate.ofInstant(clock.instant(), SEOUL);
        return jdbc.sql("""
                UPDATE external_opportunity_collection
                   SET ai_attempts = CASE WHEN ai_usage_day = :day THEN ai_attempts + 1 ELSE 1 END, ai_usage_day = :day
                 WHERE id = 1 AND lease_token = :lease AND (ai_usage_day IS NULL OR ai_usage_day <> :day OR ai_attempts < :limit)
                """).param("day", day).param("lease", lease).param("limit", limit).update() == 1;
    }

    void finish(String lease, List<SourceReport> reports) {
        jdbc.sql("""
                UPDATE external_opportunity_collection SET lease_token = NULL, lease_until = NULL,
                    last_run_at = :now, source_report_json = :reports WHERE id = 1 AND lease_token = :lease
                """).param("now", now()).param("reports", encode(reports)).param("lease", lease).update();
    }

    private OffsetDateTime now() { return clock.instant().atOffset(ZoneOffset.UTC); }

    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new IllegalStateException("공고 정보를 저장할 수 없습니다."); }
    }

    private Content decode(String source) {
        try { return json.readValue(source, Content.class); }
        catch (JsonProcessingException e) { throw new IllegalStateException("공고 정보를 읽을 수 없습니다."); }
    }

    private List<SourceReport> reports(String source) {
        if (source == null) return List.of();
        try { return json.readValue(source, REPORTS); }
        catch (JsonProcessingException e) { throw new IllegalStateException("수집 결과를 읽을 수 없습니다."); }
    }

    private static String sha256(String content) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
