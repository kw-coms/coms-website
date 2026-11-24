package com.coms.backend.service;

import com.coms.backend.config.StudyConcurrencyDatabase;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.StudyGroup;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.StudyGroupMemberRepository;
import com.coms.backend.repository.StudyGroupRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "storage.location=./build/test-uploads/study-leader-deletion"
})
class StudyLeaderDeletionConcurrencyTest {
    @Autowired MemberRepository members;
    @Autowired StudyGroupRepository groups;
    @Autowired StudyGroupMemberRepository memberships;
    @Autowired AdminService admin;
    @Autowired StudyGroupService studies;
    @Autowired TransactionTemplate transaction;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        StudyConcurrencyDatabase.configure(registry, "study_leader_deletion");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void appointmentWaitsForEitherAccountDeletionPath(boolean selfDeletion) throws Exception {
        String suffix = selfDeletion ? "01" : "02";
        Member next = saveMember("20267000" + suffix, Member.Role.USER);
        Member officer = saveMember("20268000" + suffix, Member.Role.OFFICER);
        StudyGroup group = new StudyGroup();
        group.setName("리더 임명 잠금");
        group.setTerm("2026 2학기");
        group.setCreatedBy(officer.getStudentId());
        group.setStatus(StudyGroup.Status.RECRUITING);
        long groupId = groups.saveAndFlush(group).getId();

        var deletionReady = new CountDownLatch(1);
        var finishDeletion = new CountDownLatch(1);
        var appointmentStarted = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var deletion = executor.submit(() -> transaction.executeWithoutResult(status -> {
                if (selfDeletion) admin.deleteByStudentId(next.getStudentId());
                else admin.deleteMember(next.getId());
                deletionReady.countDown();
                await(finishDeletion);
            }));
            try {
                await(deletionReady);
                var appointment = executor.submit(() -> {
                    appointmentStarted.countDown();
                    return studies.appointLeader(groupId, next.getStudentId(), officer.getStudentId());
                });
                await(appointmentStarted);
                assertThrows(TimeoutException.class, () -> appointment.get(500, TimeUnit.MILLISECONDS));
                finishDeletion.countDown();
                deletion.get(10, TimeUnit.SECONDS);
                var failure = assertThrows(ExecutionException.class, () -> appointment.get(10, TimeUnit.SECONDS));
                assertThat(failure.getCause()).isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
            } finally {
                finishDeletion.countDown();
            }
        }

        assertThat(members.findByStudentId(next.getStudentId())).isEmpty();
        assertThat(groups.findById(groupId).orElseThrow().getLeaderStudentId()).isNull();
        assertThat(memberships.findByGroupIdAndStudentId(groupId, next.getStudentId())).isEmpty();
    }

    private Member saveMember(String studentId, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setName(studentId);
        member.setRole(role);
        return members.saveAndFlush(member);
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
