package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.repository.EligibleMemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:eligible-member-signup-locking-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class EligibleMemberSignupLockingTest {

    @Autowired
    private EligibleMemberService eligibleMemberService;

    @Autowired
    private EligibleMemberRepository eligibleMemberRepository;

    @BeforeEach
    void setUp() {
        eligibleMemberRepository.deleteAll();
    }

    @Test
    void claimPreparedSignupHasExplicitWriteTransactionOutsideTestTransaction() throws Exception {
        Method method = EligibleMemberService.class.getMethod("claimPreparedSignup", long.class, String.class);

        assertThat(method.getAnnotation(Transactional.class))
                .as("claimPreparedSignup must open its own write transaction when caller has none")
                .isNotNull()
                .extracting(Transactional::readOnly)
                .isEqualTo(false);

        EligibleMember member = new EligibleMember();
        member.setName("홍길동");
        member.setGeneration("53");
        EligibleMember saved = eligibleMemberRepository.save(member);

        eligibleMemberService.claimPreparedSignup(saved.getId(), "G2019-" + saved.getId());

        assertThat(eligibleMemberRepository.findById(saved.getId()).orElseThrow().getStudentId())
                .isEqualTo("G2019-" + saved.getId());
    }

    @Test
    void ordinaryEligibleMemberFindByIdStaysUnlockedAndForUpdateUsesExplicitQuery() throws Exception {
        Method ordinaryFinder = EligibleMemberRepository.class.getMethod("findById", Object.class);
        Method lockedFinder = EligibleMemberRepository.class.getMethod("findByIdForUpdate", long.class);

        assertThat(ordinaryFinder.getAnnotation(Lock.class)).isNull();
        assertThat(lockedFinder.getAnnotation(Lock.class)).isNotNull();
        assertThat(lockedFinder.getAnnotation(Query.class)).isNotNull();
    }
}
