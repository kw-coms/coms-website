package com.coms.backend.service;

import com.coms.backend.config.StudyConcurrencyDatabase;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.AttendanceOpenRequest;
import com.coms.backend.repository.AttendanceSessionRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.SecureRandom;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "storage.location=./build/test-uploads/attendance-code-race"
})
class AttendanceCodeConcurrencyTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        StudyConcurrencyDatabase.configure(registry, "attendance_code_concurrency");
    }

    @Autowired AttendanceService attendance;
    @Autowired AttendanceSessionRepository sessions;
    @Autowired MemberRepository members;
    @Autowired PlatformTransactionManager transactions;

    @Test
    void concurrentOpensNeverShareTheSameLiveCode() throws Exception {
        Member first = new Member();
        first.setStudentId("code-opener-1");
        first.setName("First");
        first.setEmail("code-opener-1@example.test");
        first.setPassword("unused");
        first.setRole(Member.Role.ADMIN);
        members.saveAndFlush(first);
        Member second = new Member();
        second.setStudentId("code-opener-2");
        second.setName("Second");
        second.setEmail("code-opener-2@example.test");
        second.setPassword("unused");
        second.setRole(Member.Role.ADMIN);
        members.saveAndFlush(second);

        SecureRandom original = (SecureRandom) ReflectionTestUtils.getField(attendance, "random");
        ReflectionTestUtils.setField(attendance, "random", new SecureRandom() {
            private final ThreadLocal<Integer> calls = ThreadLocal.withInitial(() -> 0);

            @Override public int nextInt(int bound) {
                int call = calls.get();
                calls.set(call + 1);
                return call == 0 ? 1234 : 5678;
            }
        });
        CountDownLatch firstOpened = new CountDownLatch(1);
        CountDownLatch allowFirstCommit = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var firstOpen = executor.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var response = attendance.open(new AttendanceOpenRequest("First", 30), first.getStudentId());
                firstOpened.countDown();
                try {
                    if (!allowFirstCommit.await(5, TimeUnit.SECONDS)) throw new AssertionError("First transaction timed out");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(e);
                }
                return response;
            }));
            assertThat(firstOpened.await(5, TimeUnit.SECONDS)).isTrue();
            var secondOpen = executor.submit(() -> {
                secondStarted.countDown();
                return attendance.open(new AttendanceOpenRequest("Second", 30), second.getStudentId());
            });
            try {
                assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> secondOpen.get(300, TimeUnit.MILLISECONDS))
                        .isInstanceOf(TimeoutException.class);
            } finally {
                allowFirstCommit.countDown();
            }
            assertThat(firstOpen.get(5, TimeUnit.SECONDS).code()).isNotEqualTo(secondOpen.get(5, TimeUnit.SECONDS).code());
            assertThat(sessions.findByClosedAtIsNullAndClosesAtAfter(java.time.LocalDateTime.now())).hasSize(2);
        } finally {
            ReflectionTestUtils.setField(attendance, "random", original);
        }
    }
}
