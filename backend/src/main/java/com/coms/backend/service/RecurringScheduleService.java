package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.RecurringSchedule;
import com.coms.backend.dto.RecurringScheduleRequest;
import com.coms.backend.dto.RecurringScheduleResponse;
import com.coms.backend.dto.ScheduleOccurrenceResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RecurringScheduleRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class RecurringScheduleService {

    private final RecurringScheduleRepository repository;
    private final MemberRepository memberRepository;
    private final ClubActivityCategoryService categoryService;

    public RecurringScheduleService(RecurringScheduleRepository repository,
                                    MemberRepository memberRepository,
                                    ClubActivityCategoryService categoryService) {
        this.repository = repository;
        this.memberRepository = memberRepository;
        this.categoryService = categoryService;
    }

    @Transactional(readOnly = true)
    public List<RecurringScheduleResponse> list() {
        Map<String, String> categoryNames = categoryService.keyToNameMap();
        return repository.findAllByOrderByStartDateDescIdDesc().stream()
                .map(schedule -> toResponse(schedule, categoryNames))
                .toList();
    }

    public RecurringScheduleResponse create(RecurringScheduleRequest request, String creatorStudentId) {
        Member member = memberRepository.findByStudentId(creatorStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        RecurringSchedule schedule = new RecurringSchedule();
        applyRequest(schedule, request);
        schedule.setCreatedBy(creatorStudentId);
        schedule.setCreatedByName(member.getName());
        schedule.setCreatedAt(LocalDateTime.now());
        schedule.setUpdatedAt(LocalDateTime.now());

        RecurringSchedule saved = repository.save(schedule);
        return toResponse(saved, categoryService.keyToNameMap());
    }

    public RecurringScheduleResponse update(Long id, RecurringScheduleRequest request) {
        RecurringSchedule schedule = get(id);
        applyRequest(schedule, request);
        schedule.setUpdatedAt(LocalDateTime.now());
        RecurringSchedule saved = repository.save(schedule);
        return toResponse(saved, categoryService.keyToNameMap());
    }

    public void delete(Long id) {
        RecurringSchedule schedule = get(id);
        repository.delete(schedule);
    }

    @Transactional(readOnly = true)
    public RecurringSchedule get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "정기 일정을 찾을 수 없습니다."));
    }

    /**
     * Expands every recurring schedule into concrete occurrences that fall inside
     * the given month, honoring each definition's [startDate, endDate] range and
     * selected weekdays.
     */
    @Transactional(readOnly = true)
    public List<ScheduleOccurrenceResponse> occurrencesForMonth(int year, int month) {
        if (month < 1 || month > 12) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "월은 1~12 사이여야 합니다.");
        }
        YearMonth yearMonth = YearMonth.of(year, month);
        LocalDate monthStart = yearMonth.atDay(1);
        LocalDate monthEnd = yearMonth.atEndOfMonth();
        Map<String, String> categoryNames = categoryService.keyToNameMap();

        List<RecurringSchedule> schedules =
                repository.findByStartDateLessThanEqualAndEndDateGreaterThanEqual(monthEnd, monthStart);

        List<ScheduleOccurrenceResponse> occurrences = new ArrayList<>();
        for (RecurringSchedule schedule : schedules) {
            Set<DayOfWeek> days = parseDays(schedule.getDaysOfWeek());
            if (days.isEmpty()) continue;
            LocalDate rangeStart = schedule.getStartDate().isAfter(monthStart) ? schedule.getStartDate() : monthStart;
            LocalDate rangeEnd = schedule.getEndDate().isBefore(monthEnd) ? schedule.getEndDate() : monthEnd;
            for (LocalDate date = rangeStart; !date.isAfter(rangeEnd); date = date.plusDays(1)) {
                if (days.contains(date.getDayOfWeek())) {
                    occurrences.add(toOccurrence(schedule, date, categoryNames));
                }
            }
        }
        occurrences.sort((a, b) -> {
            int byDate = a.date().compareTo(b.date());
            if (byDate != 0) return byDate;
            String at = a.startTime() == null ? "" : a.startTime();
            String bt = b.startTime() == null ? "" : b.startTime();
            int byTime = at.compareTo(bt);
            return byTime != 0 ? byTime : a.title().compareTo(b.title());
        });
        return occurrences;
    }

    private void applyRequest(RecurringSchedule schedule, RecurringScheduleRequest request) {
        if (request.title() == null || request.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "일정 제목을 입력하세요.");
        }
        if (request.startDate() == null || request.endDate() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "시작일과 종료일을 입력하세요.");
        }
        if (request.endDate().isBefore(request.startDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "종료일은 시작일과 같거나 이후여야 합니다.");
        }
        Set<DayOfWeek> days = parseDays(request.daysOfWeek());
        if (days.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "반복할 요일을 하나 이상 선택하세요.");
        }
        LocalTime startTime = parseTime(request.startTime());
        LocalTime endTime = parseTime(request.endTime());
        if (startTime != null && endTime != null && endTime.isBefore(startTime)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "종료 시간은 시작 시간 이후여야 합니다.");
        }

        schedule.setTitle(request.title().trim());
        schedule.setDescription(request.description() != null && !request.description().isBlank()
                ? request.description().trim() : null);
        schedule.setStartDate(request.startDate());
        schedule.setEndDate(request.endDate());
        schedule.setDaysOfWeek(serializeDays(days));
        schedule.setStartTime(startTime);
        schedule.setEndTime(endTime);
        schedule.setLocation(request.location() != null && !request.location().isBlank()
                ? request.location().trim() : null);
        schedule.setCategory(resolveCategory(request.category()));
    }

    private String resolveCategory(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String key = value.trim();
        categoryService.requireValidKey(key);
        return key;
    }

    private LocalTime parseTime(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalTime.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "시간 형식이 올바르지 않습니다. (HH:mm)");
        }
    }

    // Accepts DayOfWeek names (MON, MONDAY) or numeric 1-7 (Mon-Sun) and abbreviations.
    private Set<DayOfWeek> parseDays(Iterable<String> values) {
        Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
        if (values == null) return days;
        for (String raw : values) {
            if (raw == null || raw.isBlank()) continue;
            String token = raw.trim().toUpperCase(Locale.ROOT);
            DayOfWeek day = mapToken(token);
            if (day == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "유효하지 않은 요일입니다: " + raw);
            }
            days.add(day);
        }
        return days;
    }

    private Set<DayOfWeek> parseDays(String csv) {
        if (csv == null || csv.isBlank()) return EnumSet.noneOf(DayOfWeek.class);
        return parseDays(List.of(csv.split(",")));
    }

    private DayOfWeek mapToken(String token) {
        switch (token) {
            case "1": case "MON": case "MONDAY": return DayOfWeek.MONDAY;
            case "2": case "TUE": case "TUESDAY": return DayOfWeek.TUESDAY;
            case "3": case "WED": case "WEDNESDAY": return DayOfWeek.WEDNESDAY;
            case "4": case "THU": case "THURSDAY": return DayOfWeek.THURSDAY;
            case "5": case "FRI": case "FRIDAY": return DayOfWeek.FRIDAY;
            case "6": case "SAT": case "SATURDAY": return DayOfWeek.SATURDAY;
            case "7": case "0": case "SUN": case "SUNDAY": return DayOfWeek.SUNDAY;
            default: return null;
        }
    }

    private String serializeDays(Set<DayOfWeek> days) {
        // Stable Mon-Sun order, full DayOfWeek names.
        return days.stream()
                .sorted()
                .map(DayOfWeek::name)
                .collect(Collectors.joining(","));
    }

    private List<String> daysAsList(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return parseDays(csv).stream().sorted().map(DayOfWeek::name).toList();
    }

    private RecurringScheduleResponse toResponse(RecurringSchedule schedule, Map<String, String> categoryNames) {
        return new RecurringScheduleResponse(
                schedule.getId(),
                schedule.getTitle(),
                schedule.getDescription(),
                schedule.getStartDate(),
                schedule.getEndDate(),
                daysAsList(schedule.getDaysOfWeek()),
                schedule.getStartTime() == null ? null : schedule.getStartTime().toString(),
                schedule.getEndTime() == null ? null : schedule.getEndTime().toString(),
                schedule.getLocation(),
                schedule.getCategory(),
                schedule.getCategory() == null ? null
                        : categoryNames.getOrDefault(schedule.getCategory(), schedule.getCategory()),
                schedule.getCreatedByName(),
                schedule.getCreatedAt(),
                schedule.getUpdatedAt()
        );
    }

    private ScheduleOccurrenceResponse toOccurrence(RecurringSchedule schedule, LocalDate date,
                                                    Map<String, String> categoryNames) {
        return new ScheduleOccurrenceResponse(
                schedule.getId(),
                schedule.getTitle(),
                schedule.getDescription(),
                date,
                schedule.getStartTime() == null ? null : schedule.getStartTime().toString(),
                schedule.getEndTime() == null ? null : schedule.getEndTime().toString(),
                schedule.getLocation(),
                schedule.getCategory(),
                schedule.getCategory() == null ? null
                        : categoryNames.getOrDefault(schedule.getCategory(), schedule.getCategory()),
                true
        );
    }
}
