package com.coms.backend.service;

import com.coms.backend.dto.ClubFormDto.*;
import com.coms.backend.repository.HackathonEventRepository;
import com.coms.backend.repository.MemberRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
public class ClubFormService {
    private static final int PAGE_SIZE = 50;
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final TypeReference<List<Question>> QUESTIONS = new TypeReference<>() {};
    private static final TypeReference<Map<String, List<String>>> ANSWERS = new TypeReference<>() {};

    private final JdbcClient jdbc;
    private final MemberRepository members;
    private final HackathonEventRepository events;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();

    public ClubFormService(JdbcClient jdbc, MemberRepository members, HackathonEventRepository events, Clock clock) {
        this.jdbc = jdbc;
        this.members = members;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Form> adminList() {
        return jdbc.sql("""
                SELECT f.*, COALESCE(e.published, FALSE) AS event_published
                FROM club_forms f LEFT JOIN hackathon_events e ON e.id = f.hackathon_event_id
                ORDER BY f.id DESC
                """).query((rs, row) -> mapForm(rs, rs.getBoolean("event_published"))).list();
    }

    @Transactional
    public Form save(Long id, Write request) {
        if (request == null || request.category() == null) throw invalid("접수 종류를 선택해 주세요.");
        Long eventId = request.hackathonEventId();
        if (eventId != null && (request.category() != Category.HACKATHON || !events.existsById(eventId)))
            throw invalid("연결할 해커톤을 다시 선택해 주세요.");
        List<Question> fields = questions(request.questions());
        String title = text(request.title(), 120, false, true);
        String description = text(request.description(), 3000, true, false);
        if (id == null) {
            var key = new GeneratedKeyHolder();
            writeParams("""
                    INSERT INTO club_forms (title, description, category, hackathon_event_id, questions_json, accepting, closes_at)
                    VALUES (:title, :description, :category, :event, :questions, :accepting, :closesAt)
                    """, request, title, description, fields).update(key, "id");
            return require(key.getKey().longValue(), false);
        }

        Form current = require(id, true);
        if (request.version() == null || current.version() != request.version())
            throw conflict("접수 양식이 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요.");
        if (count(id) > 0 && (!current.questions().equals(fields) || current.category() != request.category()
                || !Objects.equals(current.hackathonEventId(), eventId))) {
            throw conflict("응답을 받은 양식은 질문과 접수 종류를 바꿀 수 없습니다.");
        }
        writeParams("""
                UPDATE club_forms SET title = :title, description = :description, category = :category,
                    hackathon_event_id = :event, questions_json = :questions, accepting = :accepting,
                    closes_at = :closesAt, version = version + 1 WHERE id = :id
                """, request, title, description, fields).param("id", id).update();
        return require(id, false);
    }

    @Transactional
    public void delete(Long id) {
        require(id, true);
        if (count(id) > 0) throw conflict("응답을 받은 양식은 접수를 닫아 보관해 주세요.");
        jdbc.sql("DELETE FROM club_forms WHERE id = :id").param("id", id).update();
    }

    private JdbcClient.StatementSpec writeParams(String sql, Write request, String title, String description, List<Question> fields) {
        return jdbc.sql(sql).param("title", title).param("description", description)
                .param("category", request.category().name()).param("event", request.hackathonEventId())
                .param("questions", encode(fields)).param("accepting", request.accepting()).param("closesAt", request.closesAt());
    }

    @Transactional(readOnly = true)
    public List<Summary> list(String studentId) {
        return jdbc.sql("""
                SELECT f.*, r.member_id, COALESCE(e.published, FALSE) AS event_published FROM club_forms f
                LEFT JOIN club_form_responses r ON r.form_id = f.id AND r.member_id = :member
                LEFT JOIN hackathon_events e ON e.id = f.hackathon_event_id
                WHERE r.member_id IS NOT NULL OR (f.accepting = TRUE
                    AND (f.closes_at IS NULL OR f.closes_at > :now)
                    AND (f.hackathon_event_id IS NULL OR e.published = TRUE))
                ORDER BY f.id DESC
                """).param("member", memberId(studentId)).param("now", now()).query((rs, row) -> new Summary(
                rs.getLong("id"), rs.getString("title"), rs.getString("description"),
                Category.valueOf(rs.getString("category")), rs.getObject("hackathon_event_id", Long.class),
                isOpen(rs.getBoolean("accepting"), rs.getObject("closes_at", LocalDateTime.class))
                        && (rs.getObject("hackathon_event_id") == null || rs.getBoolean("event_published")),
                rs.getObject("closes_at", LocalDateTime.class), rs.getObject("member_id") != null)).list();
    }

    @Transactional(readOnly = true)
    public View view(Long id, String studentId) {
        Form form = require(id, false);
        OwnResponse response = ownResponse(id, memberId(studentId));
        if (!form.open() && response == null) throw notFound();
        return new View(form, response);
    }

    @Transactional
    public OwnResponse submit(Long id, String studentId, Submission request) {
        long member = memberId(studentId);
        // The same parent lock serializes writes, deadline/closure checks and schema edits.
        Form form = require(id, true);
        if (!form.open() || (form.hackathonEventId() != null
                && events.lockById(form.hackathonEventId()).filter(event -> event.isPublished()).isEmpty())) {
            if (ownResponse(id, member) == null) throw notFound();
            throw conflict("접수가 마감되었습니다.");
        }
        if (request == null || request.answers() == null) throw invalid("응답을 입력해 주세요.");
        if (request.formVersion() == null || form.version() != request.formVersion())
            throw conflict("양식이 변경되었습니다. 새로고침한 뒤 다시 응답해 주세요.");
        Map<String, List<String>> answers = validateAnswers(form.questions(), request.answers());
        var submittedAt = clock.instant();
        var stamp = submittedAt.atOffset(ZoneOffset.UTC);
        String payload = encode(answers);
        int updated = jdbc.sql("""
                UPDATE club_form_responses SET answers_json = :answers, submitted_at = :time
                WHERE form_id = :form AND member_id = :member
                """).param("form", id).param("member", member).param("answers", payload).param("time", stamp).update();
        if (updated == 0) {
            jdbc.sql("""
                    INSERT INTO club_form_responses (form_id, member_id, answers_json, submitted_at)
                    VALUES (:form, :member, :answers, :time)
                    """).param("form", id).param("member", member).param("answers", payload).param("time", stamp).update();
        }
        return new OwnResponse(answers, submittedAt);
    }

    @Transactional(readOnly = true)
    public Responses responses(Long id, int page) {
        require(id, false);
        if (page < 0 || page > 100_000) throw invalid("페이지 번호를 확인해 주세요.");
        List<ResponseRow> rows = jdbc.sql("""
                SELECT m.name, m.student_id, r.answers_json, r.submitted_at
                FROM club_form_responses r JOIN members m ON r.member_id = m.id
                WHERE r.form_id = :id ORDER BY r.submitted_at DESC, r.member_id DESC
                LIMIT :limit OFFSET :offset
                """).param("id", id).param("limit", PAGE_SIZE).param("offset", page * PAGE_SIZE)
                .query((rs, row) -> new ResponseRow(rs.getString("name"), rs.getString("student_id"),
                        decode(rs.getString("answers_json"), ANSWERS), rs.getObject("submitted_at", OffsetDateTime.class).toInstant())).list();
        return new Responses(rows, page, count(id));
    }

    private OwnResponse ownResponse(Long formId, long memberId) {
        return jdbc.sql("SELECT * FROM club_form_responses WHERE form_id = :id AND member_id = :member")
                .param("id", formId).param("member", memberId).query((rs, row) ->
                        new OwnResponse(decode(rs.getString("answers_json"), ANSWERS),
                                rs.getObject("submitted_at", OffsetDateTime.class).toInstant())).optional().orElse(null);
    }

    private Form require(Long id, boolean lock) {
        String sql = "SELECT * FROM club_forms WHERE id = :id" + (lock ? " FOR UPDATE" : "");
        Form form = jdbc.sql(sql).param("id", id).query((rs, row) -> mapForm(rs, true)).optional().orElseThrow(ClubFormService::notFound);
        if (!form.open() || eventIsVisible(form.hackathonEventId())) return form;
        return new Form(form.id(), form.title(), form.description(), form.category(), form.hackathonEventId(),
                form.questions(), form.accepting(), false, form.closesAt(), form.version());
    }

    private Form mapForm(ResultSet rs, boolean eventPublished) throws SQLException {
        boolean accepting = rs.getBoolean("accepting");
        LocalDateTime closesAt = rs.getObject("closes_at", LocalDateTime.class);
        Long eventId = rs.getObject("hackathon_event_id", Long.class);
        return new Form(rs.getLong("id"), rs.getString("title"), rs.getString("description"),
                Category.valueOf(rs.getString("category")), eventId, decode(rs.getString("questions_json"), QUESTIONS),
                accepting, isOpen(accepting, closesAt) && (eventId == null || eventPublished),
                closesAt, rs.getLong("version"));
    }

    private boolean eventIsVisible(Long eventId) {
        return eventId == null || events.findById(eventId).filter(event -> event.isPublished()).isPresent();
    }

    private long count(Long id) {
        return jdbc.sql("SELECT COUNT(*) FROM club_form_responses WHERE form_id = :id")
                .param("id", id).query(Long.class).single();
    }

    private long memberId(String studentId) {
        return members.findByStudentId(studentId).orElseThrow(ClubFormService::notFound).getId();
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock.withZone(SEOUL));
    }

    private boolean isOpen(boolean accepting, LocalDateTime closesAt) {
        return accepting && (closesAt == null || closesAt.isAfter(now()));
    }

    private static List<Question> questions(List<Question> fields) {
        if (fields == null || fields.isEmpty() || fields.size() > 20) throw invalid("질문은 1개 이상 20개 이하로 입력해 주세요.");
        var ids = new HashSet<String>();
        var normalized = new ArrayList<Question>();
        for (Question field : fields) {
            if (field == null || field.id() == null || !field.id().matches("[a-zA-Z0-9-]{1,40}")
                    || !ids.add(field.id()) || field.kind() == null) throw invalid("질문을 다시 확인해 주세요.");
            boolean choice = field.kind() == Kind.SINGLE || field.kind() == Kind.MULTIPLE;
            List<String> options = List.of();
            if (choice) {
                if (field.options() == null || field.options().size() < 2 || field.options().size() > 15)
                    throw invalid("선택 질문의 보기는 2개 이상 15개 이하로 입력해 주세요.");
                options = field.options().stream().map(option -> text(option, 120, false, true)).toList();
                if (Set.copyOf(options).size() != options.size()) throw invalid("중복된 보기를 확인해 주세요.");
            }
            normalized.add(new Question(field.id(), text(field.label(), 200, false, true), field.kind(), field.required(), options));
        }
        return normalized;
    }

    private static Map<String, List<String>> validateAnswers(List<Question> fields, Map<String, List<String>> raw) {
        if (raw.size() > fields.size()) throw invalid("응답 항목을 확인해 주세요.");
        var result = new LinkedHashMap<String, List<String>>();
        for (Question field : fields) {
            List<String> values = raw.getOrDefault(field.id(), List.of());
            if (values == null || values.size() > (field.kind() == Kind.MULTIPLE ? field.options().size() : 1))
                throw invalid("응답 형식을 확인해 주세요.");
            List<String> cleaned = values.stream().map(value -> text(value, field.kind() == Kind.LONG ? 2000 : 200,
                    field.kind() == Kind.LONG, false)).filter(value -> !value.isEmpty()).toList();
            if (field.required() && cleaned.isEmpty()) throw invalid("필수 질문에 응답해 주세요.");
            if (!field.options().isEmpty() && (!field.options().containsAll(cleaned) || Set.copyOf(cleaned).size() != cleaned.size()))
                throw invalid("선택한 보기를 확인해 주세요.");
            if (!cleaned.isEmpty()) result.put(field.id(), cleaned);
        }
        if (raw.keySet().stream().anyMatch(key -> fields.stream().noneMatch(field -> field.id().equals(key))))
            throw invalid("양식이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.");
        return result;
    }

    private static String text(String value, int max, boolean multiline, boolean required) {
        String normalized = value == null ? "" : value.replace("\r\n", "\n").strip();
        if (normalized.length() > max || (required && normalized.isBlank())
                || normalized.codePoints().anyMatch(cp -> Character.isISOControl(cp)
                && !(multiline && (cp == '\n' || cp == '\t')))) throw invalid("입력 길이와 내용을 확인해 주세요.");
        return normalized;
    }

    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException ex) { throw new IllegalStateException("Unable to encode club form data", ex); }
    }

    private <T> T decode(String value, TypeReference<T> type) {
        try { return json.readValue(value, type); }
        catch (JsonProcessingException ex) { throw new IllegalStateException("Unable to decode club form data", ex); }
    }

    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private static ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "접수 양식을 찾을 수 없습니다."); }
}
