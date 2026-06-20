package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.RecurringScheduleRequest;
import com.coms.backend.dto.ScheduleOccurrenceResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RecurringScheduleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:recurring-schedule-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/recurring-schedule-service"
})
@Transactional
class RecurringScheduleServiceTest {

    @Autowired
    private RecurringScheduleService recurringScheduleService;

    @Autowired
    private RecurringScheduleRepository recurringScheduleRepository;

    @Autowired
    private MemberRepository memberRepository;

    @BeforeEach
    void setUp() {
        recurringScheduleRepository.deleteAll();
        memberRepository.deleteAll();
        saveMember("2026123456", "관리자");
    }

    @Test
    void expandsMondayWednesdayScheduleWithinMonth() {
        // June 2026: Mondays = 1,8,15,22,29 ; Wednesdays = 3,10,17,24.
        recurringScheduleService.create(new RecurringScheduleRequest(
                "정기 모임", null,
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30),
                List.of("MON", "WED"), null, null, null, null), "2026123456");

        List<ScheduleOccurrenceResponse> june = recurringScheduleService.occurrencesForMonth(2026, 6);

        assertThat(june).extracting(o -> o.date().getDayOfMonth())
                .containsExactly(1, 3, 8, 10, 15, 17, 22, 24, 29);
        assertThat(june).allMatch(ScheduleOccurrenceResponse::recurring);
        assertThat(june).allMatch(o -> o.title().equals("정기 모임"));
    }

    @Test
    void respectsRangeBoundariesAcrossMonths() {
        // Range 2026-06-10 .. 2026-07-05, Fridays only.
        // June Fridays in range: 12, 19, 26. July Fridays in range: 3.
        recurringScheduleService.create(new RecurringScheduleRequest(
                "소모임", null,
                LocalDate.of(2026, 6, 10), LocalDate.of(2026, 7, 5),
                List.of("FRIDAY"), null, null, null, null), "2026123456");

        assertThat(recurringScheduleService.occurrencesForMonth(2026, 6))
                .extracting(o -> o.date().getDayOfMonth())
                .containsExactly(12, 19, 26);
        assertThat(recurringScheduleService.occurrencesForMonth(2026, 7))
                .extracting(o -> o.date().getDayOfMonth())
                .containsExactly(3);
        // A month entirely outside the range yields nothing.
        assertThat(recurringScheduleService.occurrencesForMonth(2026, 5)).isEmpty();
        assertThat(recurringScheduleService.occurrencesForMonth(2026, 8)).isEmpty();
    }

    @Test
    void carriesTimeLocationAndCategoryOntoOccurrences() {
        recurringScheduleService.create(new RecurringScheduleRequest(
                "스터디", "알고리즘",
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 7),
                List.of("MON"), "18:30", "20:00", "동아리방", "STUDY"), "2026123456");

        List<ScheduleOccurrenceResponse> june = recurringScheduleService.occurrencesForMonth(2026, 6);

        assertThat(june).hasSize(1);
        ScheduleOccurrenceResponse occ = june.get(0);
        assertThat(occ.date()).isEqualTo(LocalDate.of(2026, 6, 1));
        assertThat(occ.startTime()).isEqualTo("18:30");
        assertThat(occ.endTime()).isEqualTo("20:00");
        assertThat(occ.location()).isEqualTo("동아리방");
        assertThat(occ.category()).isEqualTo("STUDY");
        assertThat(occ.categoryName()).isEqualTo("스터디");
        assertThat(occ.description()).isEqualTo("알고리즘");
    }

    @Test
    void crudListUpdateDelete() {
        var created = recurringScheduleService.create(new RecurringScheduleRequest(
                "회의", null,
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30),
                List.of("TUE"), null, null, null, "MEETING"), "2026123456");
        assertThat(created.daysOfWeek()).containsExactly("TUESDAY");
        assertThat(created.createdByName()).isEqualTo("관리자");

        assertThat(recurringScheduleService.list()).hasSize(1);

        var updated = recurringScheduleService.update(created.id(), new RecurringScheduleRequest(
                "회의(변경)", "장소 이동",
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30),
                List.of("WED", "FRI"), "19:00", null, "회의실", "MEETING"));
        assertThat(updated.title()).isEqualTo("회의(변경)");
        assertThat(updated.daysOfWeek()).containsExactly("WEDNESDAY", "FRIDAY");
        assertThat(updated.startTime()).isEqualTo("19:00");
        assertThat(updated.location()).isEqualTo("회의실");

        recurringScheduleService.delete(created.id());
        assertThat(recurringScheduleService.list()).isEmpty();
    }

    @Test
    void rejectsInvalidInput() {
        // End before start.
        assertThatThrownBy(() -> recurringScheduleService.create(new RecurringScheduleRequest(
                "잘못", null,
                LocalDate.of(2026, 6, 30), LocalDate.of(2026, 6, 1),
                List.of("MON"), null, null, null, null), "2026123456"))
                .isInstanceOf(ResponseStatusException.class);

        // No weekdays.
        assertThatThrownBy(() -> recurringScheduleService.create(new RecurringScheduleRequest(
                "잘못", null,
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30),
                List.of(), null, null, null, null), "2026123456"))
                .isInstanceOf(ResponseStatusException.class);

        // Unknown weekday token.
        assertThatThrownBy(() -> recurringScheduleService.create(new RecurringScheduleRequest(
                "잘못", null,
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30),
                List.of("FUNDAY"), null, null, null, null), "2026123456"))
                .isInstanceOf(ResponseStatusException.class);

        // Invalid category.
        assertThatThrownBy(() -> recurringScheduleService.create(new RecurringScheduleRequest(
                "잘못", null,
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30),
                List.of("MON"), null, null, null, "NOPE"), "2026123456"))
                .isInstanceOf(ResponseStatusException.class);

        // Invalid month.
        assertThatThrownBy(() -> recurringScheduleService.occurrencesForMonth(2026, 13))
                .isInstanceOf(ResponseStatusException.class);
    }

    private void saveMember(String studentId, String name) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@kw.ac.kr");
        member.setPassword("encoded");
        member.setEmailVerified(true);
        member.setRole(Member.Role.ADMIN);
        memberRepository.save(member);
    }
}
