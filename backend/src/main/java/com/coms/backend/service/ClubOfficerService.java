package com.coms.backend.service;

import com.coms.backend.domain.ClubOfficer;
import com.coms.backend.domain.ClubOfficer.OfficerRole;
import com.coms.backend.domain.ClubOfficerTerm;
import com.coms.backend.domain.EligibleMember;
import com.coms.backend.dto.ClubOfficerDto.*;
import com.coms.backend.repository.ClubOfficerRepository;
import com.coms.backend.repository.ClubOfficerTermRepository;
import com.coms.backend.repository.EligibleMemberRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** 역대 회장단. 읽기는 로그인한 회원, 쓰기는 회장(/api/admin/** URL 규칙). */
@Service
public class ClubOfficerService {
    static final int MAX_LABEL = 20;
    static final int MAX_NAME = 40;
    static final int MAX_NOTE = 200;
    static final int MIN_YEAR = 1900;
    static final int MAX_YEAR = 2100;
    static final int MAX_IMPORT_ROWS = 500;
    static final int MAX_NAMES_PER_ROLE = 10;
    private static final Pattern TERM_NUMBER = Pattern.compile("^(\\d+)대$");

    private final ClubOfficerTermRepository terms;
    private final ClubOfficerRepository officers;
    private final EligibleMemberRepository roster;

    public ClubOfficerService(ClubOfficerTermRepository terms, ClubOfficerRepository officers,
                              EligibleMemberRepository roster) {
        this.terms = terms;
        this.officers = officers;
        this.roster = roster;
    }

    // ---- 읽기 ------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<TermView> list() {
        List<ClubOfficerTerm> all = terms.findAllByOrderByYearDescPositionDescIdDesc();
        Map<Long, List<ClubOfficer>> byTerm = officersByTerm(all);
        Map<Long, EligibleMember> linked = linkedMembers(byTerm.values());
        return all.stream().map(term -> new TermView(term.getId(), term.getLabel(), term.getYear(), term.getPosition(),
                term.getNote(), byTerm.getOrDefault(term.getId(), List.of()).stream()
                        .map(o -> new OfficerView(o.getId(), o.getRole().name(), o.getName(), generationOf(linked, o)))
                        .toList())).toList();
    }

    @Transactional(readOnly = true)
    public List<AdminTermView> adminList() {
        List<ClubOfficerTerm> all = terms.findAllByOrderByYearDescPositionDescIdDesc();
        return adminViews(all);
    }

    // ---- 임기 ------------------------------------------------------------------------------

    @Transactional
    public AdminTermView createTerm(TermWrite request) {
        String label = required(request.label(), MAX_LABEL, "임기 이름");
        int year = year(request.year());
        if (terms.findByLabel(label).isPresent()) throw conflict("이미 같은 이름의 임기가 있습니다.");
        ClubOfficerTerm term = new ClubOfficerTerm();
        term.setLabel(label);
        term.setYear(year);
        term.setNote(optional(request.note(), MAX_NOTE, "메모"));
        term.setPosition(request.position() != null ? request.position() : nextPosition(year));
        return adminView(save(term));
    }

    @Transactional
    public AdminTermView updateTerm(Long id, TermWrite request) {
        ClubOfficerTerm term = term(id);
        String label = required(request.label(), MAX_LABEL, "임기 이름");
        int year = year(request.year());
        terms.findByLabel(label).filter(other -> !other.getId().equals(id)).ifPresent(other -> {
            throw conflict("이미 같은 이름의 임기가 있습니다.");
        });
        term.setLabel(label);
        term.setYear(year);
        term.setNote(optional(request.note(), MAX_NOTE, "메모"));
        if (request.position() != null) term.setPosition(request.position());
        return adminView(save(term));
    }

    @Transactional
    public void deleteTerm(Long id) {
        terms.delete(term(id));
    }

    /** 같은 해의 임기 전부를 오름차순(앞선 임기부터)으로 다시 매긴다. */
    @Transactional
    public List<AdminTermView> reorderTerms(OrderWrite request) {
        List<Long> ids = ids(request);
        List<ClubOfficerTerm> found = terms.findAllById(ids);
        if (found.size() != ids.size()) throw notFound("임기를 찾을 수 없습니다.");
        Set<Integer> years = found.stream().map(ClubOfficerTerm::getYear).collect(Collectors.toSet());
        if (years.size() != 1) throw bad("같은 해의 임기끼리만 순서를 바꿀 수 있습니다.");
        if (terms.findByYear(years.iterator().next()).size() != ids.size()) throw bad("해당 연도의 임기를 모두 포함해야 합니다.");
        Map<Long, ClubOfficerTerm> byId = found.stream().collect(Collectors.toMap(ClubOfficerTerm::getId, Function.identity()));
        for (int i = 0; i < ids.size(); i++) byId.get(ids.get(i)).setPosition(i);
        terms.saveAll(found);
        return adminViews(ids.stream().map(byId::get).toList());
    }

    // ---- 임원 ------------------------------------------------------------------------------

    @Transactional
    public AdminTermView addOfficer(Long termId, OfficerWrite request) {
        ClubOfficerTerm term = term(termId);
        ClubOfficer officer = new ClubOfficer();
        officer.setTermId(termId);
        officer.setRole(role(request.role()));
        officer.setName(required(request.name(), MAX_NAME, "이름"));
        officer.setPosition(officers.findByTermIdOrderByPositionAscIdAsc(termId).size());
        officers.save(officer);
        return adminView(term);
    }

    @Transactional
    public AdminTermView updateOfficer(Long id, OfficerWrite request) {
        ClubOfficer officer = officer(id);
        officer.setRole(role(request.role()));
        String name = required(request.name(), MAX_NAME, "이름");
        // 이름이 바뀌면 다른 사람이므로 기존 명부 연결을 유지하지 않는다.
        if (!name.equals(officer.getName())) officer.setEligibleMemberId(null);
        officer.setName(name);
        officers.save(officer);
        return adminView(term(officer.getTermId()));
    }

    @Transactional
    public AdminTermView deleteOfficer(Long id) {
        ClubOfficer officer = officer(id);
        officers.delete(officer);
        return adminView(term(officer.getTermId()));
    }

    @Transactional
    public AdminTermView reorderOfficers(Long termId, OrderWrite request) {
        ClubOfficerTerm term = term(termId);
        List<Long> ids = ids(request);
        List<ClubOfficer> current = officers.findByTermIdOrderByPositionAscIdAsc(termId);
        if (!new HashSet<>(ids).equals(current.stream().map(ClubOfficer::getId).collect(Collectors.toSet()))
                || ids.size() != current.size()) {
            throw bad("임원 목록이 현재와 다릅니다. 새로고침 후 다시 시도해 주세요.");
        }
        Map<Long, ClubOfficer> byId = current.stream().collect(Collectors.toMap(ClubOfficer::getId, Function.identity()));
        for (int i = 0; i < ids.size(); i++) byId.get(ids.get(i)).setPosition(i);
        officers.saveAll(current);
        return adminView(term);
    }

    /** eligibleMemberId 가 null 이면 연결을 푼다. */
    @Transactional
    public AdminTermView linkOfficer(Long id, LinkWrite request) {
        ClubOfficer officer = officer(id);
        Long memberId = request == null ? null : request.eligibleMemberId();
        if (memberId != null && !roster.existsById(memberId)) throw notFound("명부에서 해당 항목을 찾을 수 없습니다.");
        officer.setEligibleMemberId(memberId);
        officers.save(officer);
        return adminView(term(officer.getTermId()));
    }

    // ---- 일괄 등록 ----------------------------------------------------------------------------

    /**
     * 임기 이름(label)을 키로 만들거나 고친다. 같은 입력을 다시 보내도 결과가 같다.
     * 기존 임기의 임원은 (직책, 이름)이 같으면 그대로 두어 명부 연결이 유지된다. 한 줄이라도 잘못되면 전부 취소한다.
     */
    @Transactional
    public ImportResult importRows(ImportRequest request) {
        List<ImportRow> rows = request == null || request.rows() == null ? List.of() : request.rows();
        if (rows.isEmpty()) throw bad("등록할 임기가 없습니다.");
        if (rows.size() > MAX_IMPORT_ROWS) throw bad("한 번에 " + MAX_IMPORT_ROWS + "개 임기까지 등록할 수 있습니다.");
        Set<String> seen = new HashSet<>();
        int created = 0, updated = 0, unchanged = 0;
        Set<Integer> reorderYears = new LinkedHashSet<>();
        for (int i = 0; i < rows.size(); i++) {
            ImportRow row = rows.get(i);
            String where = (i + 1) + "번째 줄: ";
            String label;
            int year;
            List<String> presidents;
            List<String> vices;
            try {
                label = required(row.label(), MAX_LABEL, "임기 이름");
                year = year(row.year());
                presidents = names(row.presidents(), "회장");
                vices = names(row.vices(), "부회장");
            } catch (ResponseStatusException e) {
                throw bad(where + e.getReason());
            }
            if (!seen.add(label)) throw bad(where + "임기 이름 '" + label + "'이(가) 중복되었습니다.");
            ClubOfficerTerm term = terms.findByLabel(label).orElse(null);
            boolean changed;
            boolean isNew = term == null;
            if (term == null) {
                term = new ClubOfficerTerm();
                term.setLabel(label);
                term.setYear(year);
                term.setPosition(nextPosition(year));
                term = save(term);
                reorderYears.add(year);
                changed = true;
            } else {
                changed = term.getYear() != year;
                if (changed) {
                    reorderYears.add(term.getYear());
                    reorderYears.add(year);
                    term.setYear(year);
                    term = save(term);
                }
            }
            boolean officersChanged = syncOfficers(term.getId(), presidents, vices);
            if (isNew) created++;
            else if (changed || officersChanged) updated++;
            else unchanged++;
        }
        for (int year : reorderYears) renumber(year);
        return new ImportResult(created, updated, unchanged);
    }

    // ---- 내부 ------------------------------------------------------------------------------

    private boolean syncOfficers(Long termId, List<String> presidents, List<String> vices) {
        List<ClubOfficer> existing = new ArrayList<>(officers.findByTermIdOrderByPositionAscIdAsc(termId));
        List<ClubOfficer> keep = new ArrayList<>();
        boolean changed = false;
        int position = 0;
        for (OfficerRole role : OfficerRole.values()) {
            for (String name : role == OfficerRole.PRESIDENT ? presidents : vices) {
                ClubOfficer match = existing.stream().filter(o -> o.getRole() == role && o.getName().equals(name))
                        .findFirst().orElse(null);
                if (match == null) {
                    match = new ClubOfficer();
                    match.setTermId(termId);
                    match.setRole(role);
                    match.setName(name);
                    changed = true;
                } else {
                    existing.remove(match);
                    if (match.getPosition() != position) changed = true;
                }
                match.setPosition(position++);
                keep.add(match);
            }
        }
        if (!existing.isEmpty()) {
            officers.deleteAll(existing);
            changed = true;
        }
        officers.saveAll(keep);
        return changed;
    }

    /** 해당 연도 임기를 임기 번호(초대=1, 52대=52) 순으로 position 0.. 로 매긴다. */
    private void renumber(int year) {
        List<ClubOfficerTerm> inYear = new ArrayList<>(terms.findByYear(year));
        inYear.sort(Comparator.comparingInt((ClubOfficerTerm t) -> termNumber(t.getLabel())).thenComparing(ClubOfficerTerm::getId));
        for (int i = 0; i < inYear.size(); i++) inYear.get(i).setPosition(i);
        terms.saveAll(inYear);
    }

    static int termNumber(String label) {
        if ("초대".equals(label)) return 1;
        Matcher m = TERM_NUMBER.matcher(label);
        return m.matches() && m.group(1).length() < 6 ? Integer.parseInt(m.group(1)) : Integer.MAX_VALUE;
    }

    private int nextPosition(int year) {
        return terms.findByYear(year).stream().mapToInt(ClubOfficerTerm::getPosition).max().orElse(-1) + 1;
    }

    private ClubOfficerTerm save(ClubOfficerTerm term) {
        try {
            return terms.saveAndFlush(term);
        } catch (DataIntegrityViolationException e) {
            throw conflict("이미 같은 이름의 임기가 있습니다.");
        }
    }

    private AdminTermView adminView(ClubOfficerTerm term) {
        return adminViews(List.of(term)).get(0);
    }

    private List<AdminTermView> adminViews(List<ClubOfficerTerm> list) {
        Map<Long, List<ClubOfficer>> byTerm = officersByTerm(list);
        Map<Long, EligibleMember> linked = linkedMembers(byTerm.values());
        return list.stream().map(term -> new AdminTermView(term.getId(), term.getLabel(), term.getYear(),
                term.getPosition(), term.getNote(), byTerm.getOrDefault(term.getId(), List.of()).stream().map(o -> {
                    EligibleMember member = o.getEligibleMemberId() == null ? null : linked.get(o.getEligibleMemberId());
                    return new AdminOfficerView(o.getId(), o.getRole().name(), o.getName(), o.getPosition(),
                            o.getEligibleMemberId(), member == null ? null : member.getName(), generationOf(linked, o));
                }).toList())).toList();
    }

    private Map<Long, List<ClubOfficer>> officersByTerm(List<ClubOfficerTerm> list) {
        if (list.isEmpty()) return Map.of();
        List<ClubOfficer> all = officers.findByTermIdIn(list.stream().map(ClubOfficerTerm::getId).toList());
        all.sort(Comparator.comparingInt(ClubOfficer::getPosition).thenComparing(ClubOfficer::getId));
        Map<Long, List<ClubOfficer>> byTerm = new LinkedHashMap<>();
        all.forEach(o -> byTerm.computeIfAbsent(o.getTermId(), k -> new ArrayList<>()).add(o));
        return byTerm;
    }

    private Map<Long, EligibleMember> linkedMembers(Collection<List<ClubOfficer>> groups) {
        Set<Long> ids = groups.stream().flatMap(List::stream).map(ClubOfficer::getEligibleMemberId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) return Map.of();
        return roster.findAllById(ids).stream().collect(Collectors.toMap(EligibleMember::getId, Function.identity()));
    }

    private static String generationOf(Map<Long, EligibleMember> linked, ClubOfficer officer) {
        EligibleMember member = officer.getEligibleMemberId() == null ? null : linked.get(officer.getEligibleMemberId());
        String generation = member == null ? null : member.getGeneration();
        return generation == null || generation.isBlank() ? null : generation.strip();
    }

    private ClubOfficerTerm term(Long id) {
        return terms.findById(id).orElseThrow(() -> notFound("임기를 찾을 수 없습니다."));
    }

    private ClubOfficer officer(Long id) {
        return officers.findById(id).orElseThrow(() -> notFound("임원을 찾을 수 없습니다."));
    }

    private static List<Long> ids(OrderWrite request) {
        List<Long> ids = request == null || request.ids() == null ? List.of() : request.ids();
        if (ids.isEmpty() || new HashSet<>(ids).size() != ids.size() || ids.contains(null)) throw bad("순서 목록이 올바르지 않습니다.");
        return ids;
    }

    private static OfficerRole role(String value) {
        try {
            return OfficerRole.valueOf(value == null ? "" : value.strip());
        } catch (IllegalArgumentException e) {
            throw bad("직책은 회장 또는 부회장이어야 합니다.");
        }
    }

    private static int year(Integer value) {
        if (value == null || value < MIN_YEAR || value > MAX_YEAR) throw bad("연도는 " + MIN_YEAR + "~" + MAX_YEAR + " 사이여야 합니다.");
        return value;
    }

    private static List<String> names(List<String> values, String label) {
        List<String> out = new ArrayList<>();
        for (String value : values == null ? List.<String>of() : values) {
            String name = value == null ? "" : value.strip();
            if (name.isEmpty()) continue;
            if (name.length() > MAX_NAME) throw bad(label + " 이름은 " + MAX_NAME + "자까지 입력할 수 있습니다.");
            if (!out.contains(name)) out.add(name);
        }
        if (out.size() > MAX_NAMES_PER_ROLE) throw bad(label + "은(는) " + MAX_NAMES_PER_ROLE + "명까지 입력할 수 있습니다.");
        return out;
    }

    private static String required(String value, int max, String label) {
        String text = value == null ? "" : value.strip();
        if (text.isEmpty()) throw bad(label + "을(를) 입력해 주세요.");
        if (text.length() > max) throw bad(label + "은(는) " + max + "자까지 입력할 수 있습니다.");
        return text;
    }

    private static String optional(String value, int max, String label) {
        String text = value == null ? "" : value.strip();
        if (text.length() > max) throw bad(label + "은(는) " + max + "자까지 입력할 수 있습니다.");
        return text;
    }

    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private static ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }
}
