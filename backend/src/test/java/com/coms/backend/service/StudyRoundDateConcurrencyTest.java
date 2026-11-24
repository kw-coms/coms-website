package com.coms.backend.service;

import com.coms.backend.config.StudyConcurrencyDatabase;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.StudyGroup;
import com.coms.backend.domain.StudyGroupMember;
import com.coms.backend.domain.StudySession;
import com.coms.backend.dto.AttendanceCheckInRequest;
import com.coms.backend.dto.StudyAttendanceDto;
import com.coms.backend.repository.AttendanceRecordRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.StudyGroupMemberRepository;
import com.coms.backend.repository.StudyGroupRepository;
import com.coms.backend.repository.StudySessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "storage.location=./build/test-uploads/study-round-date"
})
class StudyRoundDateConcurrencyTest {
    @Autowired MemberRepository members;
    @Autowired StudyGroupRepository groups;
    @Autowired StudyGroupMemberRepository memberships;
    @Autowired StudySessionRepository sessions;
    @Autowired AttendanceRecordRepository records;
    @Autowired StudyAttendanceService studyAttendance;
    @Autowired AttendanceService attendance;
    @Autowired TransactionTemplate transaction;

    private String leader;
    private long groupId;
    private long roundId;
    private LocalDate today;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        StudyConcurrencyDatabase.configure(registry, "study_round_date");
    }

    @BeforeEach
    void createRound() {
        today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        Member member = new Member();
        member.setStudentId("date-" + java.util.UUID.randomUUID().toString().substring(0, 10));
        member.setName("스터디 리더");
        member.setEmail(member.getStudentId() + "@example.com");
        member.setPassword("unused");
        member.setRole(Member.Role.USER);
        leader = members.saveAndFlush(member).getStudentId();

        StudyGroup group = new StudyGroup();
        group.setName("회차 날짜");
        group.setTerm("2026 2학기");
        group.setStatus(StudyGroup.Status.ACTIVE);
        group.setCreatedBy(leader);
        group.setLeaderStudentId(leader);
        groupId = groups.saveAndFlush(group).getId();

        StudyGroupMember row = new StudyGroupMember();
        row.setGroupId(groupId);
        row.setStudentId(leader);
        row.setRole(StudyGroupMember.Role.LEADER);
        row.setStatus(StudyGroupMember.Status.APPROVED);
        memberships.saveAndFlush(row);
        roundId = studyAttendance.create(groupId, new StudyAttendanceDto.Write(today, "회차", null), leader).id();
    }

    @Test
    void trackedRoundCannotMoveIntoTheFutureEvenAfterClosing() {
        studyAttendance.open(groupId, roundId, new StudyAttendanceDto.Open(30), leader);
        studyAttendance.close(groupId, roundId, leader);

        assertThatThrownBy(() -> studyAttendance.edit(groupId, roundId,
                new StudyAttendanceDto.Write(today.plusDays(1), "회차", null), leader))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(sessions.findById(roundId).orElseThrow().getDate()).isEqualTo(today);
    }

    @Test
    void checkInRereadsTheRoundDateAfterAcquiringTheGroupLock() throws Exception {
        var opened = studyAttendance.open(groupId, roundId, new StudyAttendanceDto.Open(30), leader);
        var roundLocked = new CountDownLatch(1);
        var checkInStarted = new CountDownLatch(1);
        var finishChange = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var change = executor.submit(() -> transaction.executeWithoutResult(status -> {
                groups.findByIdForUpdate(groupId).orElseThrow();
                StudySession round = sessions.findById(roundId).orElseThrow();
                roundLocked.countDown();
                await(finishChange);
                round.setDate(today.plusDays(1));
            }));
            try {
                await(roundLocked);
                var checkIn = executor.submit(() -> {
                    checkInStarted.countDown();
                    return attendance.checkIn(new AttendanceCheckInRequest(opened.attendanceCode(), groupId, roundId), leader);
                });
                await(checkInStarted);
                assertThrows(TimeoutException.class, () -> checkIn.get(500, TimeUnit.MILLISECONDS));
                finishChange.countDown();
                change.get(10, TimeUnit.SECONDS);
                var failure = assertThrows(ExecutionException.class, () -> checkIn.get(10, TimeUnit.SECONDS));
                assertThat(failure.getCause()).isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
            } finally {
                finishChange.countDown();
            }
        }
        assertThat(records.findBySessionIdAndStudentId(opened.attendanceSessionId(), leader)).isEmpty();
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssertionError(e);
        }
    }
}
