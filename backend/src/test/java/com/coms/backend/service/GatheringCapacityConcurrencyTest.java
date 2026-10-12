package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.GatheringRequest;
import com.coms.backend.repository.GatheringRepository;
import com.coms.backend.repository.GatheringSignupRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Members signing up at the same moment do not overfill a gathering. Not @Transactional: each
 * sign-up has to commit on its own thread for the others to see it, so the rows this test
 * makes are removed by hand afterwards.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:gathering-concurrency-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
        "storage.location=./build/test-uploads/gathering-concurrency"
})
class GatheringCapacityConcurrencyTest {

    private static final String HOST = "2026000060";
    private static final int PLACES = 3;
    private static final int MEMBERS = 8;

    @Autowired
    private GatheringService gatheringService;
    @Autowired
    private GatheringRepository gatheringRepository;
    @Autowired
    private GatheringSignupRepository signupRepository;
    @Autowired
    private MemberRepository memberRepository;

    @BeforeEach
    void setUp() {
        cleanUp();
        memberRepository.save(member(HOST, "연사람"));
        for (int i = 1; i <= MEMBERS; i++) {
            memberRepository.save(member(studentId(i), "부원" + i));
        }
    }

    @AfterEach
    void cleanUp() {
        signupRepository.deleteAll();
        gatheringRepository.deleteAll();
        memberRepository.deleteAll();
    }

    @Test
    void theLastPlacesGoToAsManyMembersAsThereArePlaces() throws Exception {
        long id = gatheringService.create(new GatheringRequest("정원 있는 모임", null, PLACES, null, null), HOST).gathering().id();

        ExecutorService pool = Executors.newFixedThreadPool(MEMBERS);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<HttpStatus>> outcomes = new ArrayList<>();
        try {
            for (int i = 1; i <= MEMBERS; i++) {
                String studentId = studentId(i);
                outcomes.add(pool.submit(() -> {
                    start.await();
                    try {
                        gatheringService.join(id, studentId, null);
                        return HttpStatus.OK;
                    } catch (ResponseStatusException refused) {
                        return HttpStatus.valueOf(refused.getStatusCode().value());
                    }
                }));
            }
            start.countDown();

            int signedUp = 0;
            int refused = 0;
            for (Future<HttpStatus> outcome : outcomes) {
                HttpStatus status = outcome.get(30, TimeUnit.SECONDS);
                if (status == HttpStatus.OK) signedUp++;
                else if (status == HttpStatus.CONFLICT) refused++;
            }
            assertThat(signedUp).isEqualTo(PLACES);
            assertThat(refused).isEqualTo(MEMBERS - PLACES);
            assertThat(signupRepository.countByGatheringId(id)).isEqualTo(PLACES);
        } finally {
            pool.shutdownNow();
        }
    }

    private static String studentId(int index) {
        return "20260000" + (60 + index);
    }

    private static Member member(String studentId, String name) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(Member.Role.USER);
        member.setEmailVerified(true);
        return member;
    }
}
