package com.coms.backend.service;

import com.coms.backend.domain.BannedStudent;
import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.BannedStudentRepository;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.dto.SignupRequest;
import com.coms.backend.service.EligibleMemberService.PreparedSignup;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:eligible-member-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@Transactional
@Import(EligibleMemberServiceTest.FixedClockConfig.class)
class EligibleMemberServiceTest {
    @Autowired
    private EligibleMemberService eligibleMemberService;

    @Autowired
    private EligibleMemberRepository eligibleMemberRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private BannedStudentRepository bannedStudentRepository;

    @BeforeEach
    void setUp() {
        eligibleMemberRepository.deleteAll();
    }

    @Test
    void rosterContactFallbackUsesOnlyUniqueStudentIdAndTracksAccountChanges() {
        EligibleMember blank = new EligibleMember();
        blank.setStudentId("2026991001");
        blank.setName("가상회원");
        blank.setPhone(" ");
        eligibleMemberRepository.saveAndFlush(blank);

        EligibleMember kept = new EligibleMember();
        kept.setStudentId("2026991002");
        kept.setName("가상회원");
        kept.setEmail("stored@example.com");
        kept.setPhone("01000000002");
        eligibleMemberRepository.saveAndFlush(kept);

        EligibleMember unlinked = new EligibleMember();
        unlinked.setName("가상회원");
        eligibleMemberRepository.saveAndFlush(unlinked);

        Member account = new Member();
        account.setStudentId("2026991001");
        account.setName("가상회원");
        account.setEmail("test@example.com");
        account.setPhone("01000000001");
        account.setPassword("unused");
        memberRepository.saveAndFlush(account);

        Member matchedWithStoredContacts = new Member();
        matchedWithStoredContacts.setStudentId("2026991002");
        matchedWithStoredContacts.setName("가상회원");
        matchedWithStoredContacts.setEmail("other@example.com");
        matchedWithStoredContacts.setPhone("01000000009");
        matchedWithStoredContacts.setPassword("unused");
        memberRepository.saveAndFlush(matchedWithStoredContacts);

        var rows = eligibleMemberService.listRoster();
        assertThat(rows).filteredOn(row -> row.id().equals(blank.getId())).singleElement()
                .satisfies(row -> {
                    assertThat(row.email()).isEqualTo("test@example.com");
                    assertThat(row.phone()).isEqualTo("01000000001");
                    assertThat(row.emailFromAccount()).isTrue();
                    assertThat(row.phoneFromAccount()).isTrue();
                    assertThat(row.studentIdFromAccount()).isFalse();
                });
        assertThat(rows).filteredOn(row -> row.id().equals(kept.getId())).singleElement()
                .satisfies(row -> {
                    assertThat(row.email()).isEqualTo("stored@example.com");
                    assertThat(row.phone()).isEqualTo("01000000002");
                    assertThat(row.emailFromAccount()).isFalse();
                    assertThat(row.phoneFromAccount()).isFalse();
                });
        assertThat(rows).filteredOn(row -> row.id().equals(unlinked.getId())).singleElement()
                .satisfies(row -> {
                    assertThat(row.email()).isNull();
                    assertThat(row.phone()).isNull();
                });

        account.setEmail("updated@example.com");
        account.setPhone("01000000003");
        memberRepository.saveAndFlush(account);
        assertThat(eligibleMemberService.listRoster()).filteredOn(row -> row.id().equals(blank.getId()))
                .singleElement().satisfies(row -> {
                    assertThat(row.email()).isEqualTo("updated@example.com");
                    assertThat(row.phone()).isEqualTo("01000000003");
                });
    }

    @Test
    void copiedNameAndPhoneOnlySuggestsAccountUntilOperatorAppliesIt() {
        EligibleMember roster = new EligibleMember();
        roster.setName(" 가상회원 ");
        roster.setPhone("010-0000-0001");
        roster = eligibleMemberRepository.saveAndFlush(roster);
        Long rosterId = roster.getId();

        Member account = new Member();
        account.setStudentId("2026991001");
        account.setName("가상회원");
        account.setPhone("01000000001");
        account.setEmail("test@example.com");
        account.setPassword("unused");
        memberRepository.saveAndFlush(account);

        assertThat(eligibleMemberService.listRoster()).filteredOn(row -> row.id().equals(rosterId))
                .singleElement().satisfies(row -> {
                    assertThat(row.studentId()).isNull();
                    assertThat(row.studentIdFromAccount()).isFalse();
                    assertThat(row.email()).isNull();
                    assertThat(row.emailFromAccount()).isFalse();
                    assertThat(row.suggestedMemberId()).isEqualTo(account.getId());
                    assertThat(row.suggestedStudentId()).isEqualTo("2026991001");
                    assertThat(row.suggestedEmail()).isEqualTo("test@example.com");
                    assertThat(row.phone()).isEqualTo("010-0000-0001");
                    assertThat(row.phoneFromAccount()).isFalse();
                });
        assertThat(eligibleMemberRepository.findById(rosterId).orElseThrow().getStudentId()).isNull();

        account.setEmail("changed@example.com");
        memberRepository.saveAndFlush(account);
        assertThat(eligibleMemberService.listRoster()).filteredOn(row -> row.id().equals(rosterId))
                .singleElement().satisfies(row -> {
                    assertThat(row.email()).isNull();
                    assertThat(row.suggestedEmail()).isEqualTo("changed@example.com");
                });

        roster.setEmail("stored@example.com");
        eligibleMemberRepository.saveAndFlush(roster);
        assertThat(eligibleMemberService.listRoster()).filteredOn(row -> row.id().equals(rosterId))
                .singleElement().satisfies(row -> {
                    assertThat(row.email()).isEqualTo("stored@example.com");
                    assertThat(row.emailFromAccount()).isFalse();
                    assertThat(row.studentIdFromAccount()).isFalse();
                    assertThat(row.suggestedMemberId()).isNull();
                });

        assertThatThrownBy(() -> eligibleMemberService.applyRosterSuggestion(rosterId, account.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("빈 칸");
    }

    @Test
    void rosterWithoutStudentIdNeverMatchesNameAloneOrAmbiguousPairs() {
        EligibleMember noPhone = new EligibleMember();
        noPhone.setName("가상회원");
        noPhone = eligibleMemberRepository.saveAndFlush(noPhone);
        Long noPhoneId = noPhone.getId();

        EligibleMember duplicateOne = new EligibleMember();
        duplicateOne.setName("가상회원");
        duplicateOne.setPhone("010-0000-0002");
        duplicateOne = eligibleMemberRepository.saveAndFlush(duplicateOne);
        Long duplicateOneId = duplicateOne.getId();
        EligibleMember duplicateTwo = new EligibleMember();
        duplicateTwo.setName("가상회원");
        duplicateTwo.setPhone("01000000002");
        duplicateTwo = eligibleMemberRepository.saveAndFlush(duplicateTwo);
        Long duplicateTwoId = duplicateTwo.getId();

        EligibleMember ambiguousAccount = new EligibleMember();
        ambiguousAccount.setName("가상회원");
        ambiguousAccount.setPhone("01000000003");
        ambiguousAccount = eligibleMemberRepository.saveAndFlush(ambiguousAccount);
        Long ambiguousAccountId = ambiguousAccount.getId();

        for (int i = 1; i <= 4; i++) {
            Member account = new Member();
            account.setStudentId("202699100" + i);
            account.setName("가상회원");
            account.setPhone(i == 1 ? "01000000001" : i == 2 ? "01000000002" : "01000000003");
            account.setEmail("test" + i + "@example.com");
            account.setPassword("unused");
            memberRepository.saveAndFlush(account);
        }

        var rows = eligibleMemberService.listRoster();
        for (Long id : new Long[]{noPhoneId, duplicateOneId, duplicateTwoId, ambiguousAccountId}) {
            assertThat(rows).filteredOn(row -> row.id().equals(id)).singleElement()
                    .satisfies(row -> {
                        assertThat(row.studentId()).isNull();
                        assertThat(row.email()).isNull();
                        assertThat(row.studentIdFromAccount()).isFalse();
                        assertThat(row.emailFromAccount()).isFalse();
                    });
        }
    }

    @Test
    void applySuggestionRechecksUniquenessAndBlankFields() {
        EligibleMember row = new EligibleMember();
        row.setName("가상회원");
        row.setPhone("010-0000-0001");
        row = eligibleMemberRepository.saveAndFlush(row);
        Long rowId = row.getId();

        Member account = new Member();
        account.setStudentId("2026991001");
        account.setName("가상회원");
        account.setPhone("01000000001");
        account.setEmail("test@example.com");
        account.setPassword("unused");
        account = memberRepository.saveAndFlush(account);
        Long accountId = account.getId();

        account.setEmail("");
        memberRepository.saveAndFlush(account);
        assertThat(eligibleMemberService.listRoster()).filteredOn(candidate -> candidate.id().equals(rowId))
                .singleElement().satisfies(candidate -> assertThat(candidate.suggestedMemberId()).isNull());
        assertThatThrownBy(() -> eligibleMemberService.applyRosterSuggestion(rowId, accountId))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("계정 학번과 이메일");
        account.setEmail("test@example.com");
        memberRepository.saveAndFlush(account);

        account.setStudentId("");
        memberRepository.saveAndFlush(account);
        assertThat(eligibleMemberService.listRoster()).filteredOn(candidate -> candidate.id().equals(rowId))
                .singleElement().satisfies(candidate -> assertThat(candidate.suggestedMemberId()).isNull());
        assertThatThrownBy(() -> eligibleMemberService.applyRosterSuggestion(rowId, accountId))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("계정 학번과 이메일");
        account.setStudentId("2026991001");
        memberRepository.saveAndFlush(account);

        EligibleMember duplicate = new EligibleMember();
        duplicate.setName("가상회원");
        duplicate.setPhone("01000000001");
        duplicate = eligibleMemberRepository.saveAndFlush(duplicate);
        assertThatThrownBy(() -> eligibleMemberService.applyRosterSuggestion(rowId, accountId))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("중복");
        eligibleMemberRepository.delete(duplicate);
        eligibleMemberRepository.flush();

        EligibleMember numberedDuplicate = new EligibleMember();
        numberedDuplicate.setStudentId("2026991003");
        numberedDuplicate.setName("가상회원");
        numberedDuplicate.setPhone("01000000001");
        numberedDuplicate = eligibleMemberRepository.saveAndFlush(numberedDuplicate);
        assertThat(eligibleMemberService.listRoster()).filteredOn(candidate -> candidate.id().equals(rowId))
                .singleElement().satisfies(candidate -> assertThat(candidate.suggestedMemberId()).isNull());
        assertThatThrownBy(() -> eligibleMemberService.applyRosterSuggestion(rowId, accountId))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("중복");
        eligibleMemberRepository.delete(numberedDuplicate);
        eligibleMemberRepository.flush();

        Member second = new Member();
        second.setStudentId("2026991002");
        second.setName("가상회원");
        second.setPhone("01000000001");
        second.setEmail("second@example.com");
        second.setPassword("unused");
        second = memberRepository.saveAndFlush(second);
        assertThatThrownBy(() -> eligibleMemberService.applyRosterSuggestion(rowId, accountId))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("중복");
        memberRepository.delete(second);
        memberRepository.flush();

        account.setPhone("01000000002");
        memberRepository.saveAndFlush(account);
        assertThatThrownBy(() -> eligibleMemberService.applyRosterSuggestion(rowId, accountId))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("일치하지 않습니다");
        account.setPhone("01000000001");
        memberRepository.saveAndFlush(account);

        assertThat(eligibleMemberService.applyRosterSuggestion(rowId, accountId)).isTrue();
        assertThat(eligibleMemberService.applyRosterSuggestion(rowId, accountId)).isFalse();
        assertThat(eligibleMemberRepository.findById(rowId).orElseThrow())
                .satisfies(saved -> {
                    assertThat(saved.getStudentId()).isEqualTo("2026991001");
                    assertThat(saved.getEmail()).isEqualTo("test@example.com");
                });
    }

    @Test
    void importedEmailFillsOnlyBlankRosterValueAndRejectsInvalidAddress() throws Exception {
        eligibleMemberService.addSingle("2026991001", "가상회원", "60", null);
        var first = eligibleMemberService.importRoster(workbookFile(
                new String[]{"학번", "이름", "이메일"}, new String[]{"2026991001", "가상회원", "test@example.com"}));
        assertThat(first.skipped()).isEqualTo(1);
        assertThat(eligibleMemberService.listRoster().getFirst().email()).isEqualTo("test@example.com");

        eligibleMemberService.importRoster(workbookFile(
                new String[]{"학번", "이름", "이메일"}, new String[]{"2026991001", "가상회원", "other@example.com"}));
        assertThat(eligibleMemberService.listRoster().getFirst().email()).isEqualTo("test@example.com");

        assertThatThrownBy(() -> eligibleMemberService.importRoster(workbookFile(
                new String[]{"학번", "이름", "이메일"}, new String[]{"2026991003", "가상회원", "bad\naddress@example.com"})))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void csvImportReadsEmailColumn() {
        var response = eligibleMemberService.importRoster(csvFile(
                "이름,학번,E-mail\n가상회원,2026991001,test@example.com\n".getBytes(StandardCharsets.UTF_8)));
        assertThat(response.imported()).isEqualTo(1);
        assertThat(eligibleMemberService.listRoster().getFirst().email()).isEqualTo("test@example.com");
    }

    @Test
    void adminEmailEditTrimsPreservesAndClearsButRejectsMalformedValues() {
        eligibleMemberService.addSingle("2026991001", "가상회원", "60", null, null,
                "  test@example.com  ", Member.Role.USER);
        var row = eligibleMemberRepository.findByStudentId("2026991001").orElseThrow();
        assertThat(row.getEmail()).isEqualTo("test@example.com");

        eligibleMemberService.updateEligibleMember(row.getId(), "2026991001", "가상회원", "60", null, null, null);
        assertThat(row.getEmail()).isEqualTo("test@example.com");
        eligibleMemberService.updateEligibleMember(row.getId(), "2026991001", "가상회원", "60", null, null, " ");
        assertThat(row.getEmail()).isNull();

        assertThatThrownBy(() -> eligibleMemberService.updateEligibleMember(
                row.getId(), "2026991001", "가상회원", "60", null, null, "bad\naddress@example.com"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void importsRosterAndValidatesStudentAndName() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"학번", "이름", "전화번호", "기수"},
                new String[]{"2024123456", "홍길동", "010-1234-5678", "1기"});

        var response = eligibleMemberService.importRoster(file);

        assertThat(response.imported()).isEqualTo(1);
        assertThat(eligibleMemberService.listRoster())
                .singleElement()
                .satisfies(member -> {
                    assertThat(member.studentId()).isEqualTo("2024123456");
                    assertThat(member.name()).isEqualTo("홍길동");
                    assertThat(member.generation()).isEqualTo("58");
                    assertThat(member.admissionYear()).isEqualTo(2024);
                });
        eligibleMemberService.validateAndClaimSignup("2024123456", "홍길동", null, null, "010-1234-5678");
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024000000", "홍길동", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void rejectsWrongName() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"학번", "이름"},
                new String[]{"2024123456", "홍길동"});
        eligibleMemberService.importRoster(file);

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024123456", "김철수", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void rejectsSignupWhenRosterPhoneDoesNotMatch() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2024123456", "홍길동", "010-1234-5678"});
        eligibleMemberService.importRoster(file);

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024123456", "홍길동", null, null, "01099998888"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.FORBIDDEN.value());

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024123456", "홍길동", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.FORBIDDEN.value());

        // Hyphen/format differences must not lock out the legitimate member.
        eligibleMemberService.validateAndClaimSignup("2024123456", "홍길동", null, null, "01012345678");
    }

    @Test
    void rejectsInvalidStudentIdFormat() {
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("123456789", "홍길동", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("12345678901", "홍길동", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("학부2024123456", "홍길동", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void rejectsInvalidNameFormat() {
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024123456", "김", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024123456", "Hong GilDong", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void importsGenerationOnlyRosterAndClaimsItForGraduate() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"이름", "전화번호", "기수", "참석 여부"},
                new String[]{"김철수", "010-1111-2222", "53기", "참석"});

        assertThat(eligibleMemberService.importRoster(file).imported()).isEqualTo(1);
        assertThat(eligibleMemberService.importRoster(file).skipped()).isEqualTo(1);

        eligibleMemberService.validateAndClaimSignup("2019123456", "김철수", "YEAR", "19", "01011112222");

        assertThat(eligibleMemberRepository.findByStudentId("2019123456")).isPresent();
        assertThat(eligibleMemberRepository.findByVerificationKey("김철수|2019")).isPresent();
    }

    @Test
    void graduateCanVerifyByGenerationButCurrentStudentCannotUseRelaxedVerification() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "53기"}));
        eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "GENERATION", "53기", null);

        eligibleMemberRepository.deleteAll();
        eligibleMemberService.importRoster(workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "54기"}));
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2020123456", "홍길동", "GENERATION", "54", null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void graduateVerificationMustMatchSubmittedFullStudentId() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "53기"}));

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "YEAR", "18", null))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "GENERATION", "52", null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void claimedGraduateRosterCannotBeReusedByAnotherStudentId() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "53기"});
        eligibleMemberService.importRoster(file);
        eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "GENERATION", "53", null);

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2019999999", "홍길동", "GENERATION", "53", null))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(eligibleMemberService.importRoster(file).skipped()).isEqualTo(1);
    }

    @Test
    void graduatePreparationDoesNotClaimRosterUntilConfirmation() {
        eligibleMemberService.addGraduateSingle("홍길동", "19", null, "010-1234-5678");

        PreparedSignup prepared = eligibleMemberService.prepareSignup(new SignupRequest(
                null,
                " 홍길동 ",
                "YEAR",
                "19",
                "hong@example.com",
                "Password!123",
                "컴퓨터공학부",
                null,
                "01012345678",
                "열심히 하겠습니다",
                "backend",
                "graduate"
        ));

        assertThat(prepared.studentId()).startsWith("G2019-");
        assertThat(prepared.generation()).isEqualTo("53");
        assertThat(prepared.initialRole()).isEqualTo(Member.Role.USER);
        assertThat(eligibleMemberRepository.findById(prepared.eligibleMemberId()).orElseThrow().getStudentId()).isBlank();

        eligibleMemberService.claimPreparedSignup(prepared.eligibleMemberId(), prepared.studentId());

        assertThat(eligibleMemberRepository.findById(prepared.eligibleMemberId()).orElseThrow().getStudentId())
                .isEqualTo(prepared.studentId());
    }

    @Test
    void addGraduateSingleAcceptsTwoDigitYear() {
        // clock fixed at 2026-06-06; cutoff = 2019; "19" → 2019 ≤ 2019 → valid
        eligibleMemberService.addGraduateSingle("김철수", "19", null);

        var roster = eligibleMemberService.listRoster();
        assertThat(roster).singleElement().satisfies(m -> {
            assertThat(m.name()).isEqualTo("김철수");
            assertThat(m.generation()).isEqualTo("53");
            assertThat(m.studentId()).isNull();
            // 학번이 없는 졸업생 행의 졸업 판정은 이 값에만 기댄다.
            assertThat(m.admissionYear()).isEqualTo(2019);
        });
    }

    @Test
    void addGraduateSingleAcceptsGeneration() {
        // generation 53 → 1966+53=2019 ≤ 2019 → valid
        eligibleMemberService.addGraduateSingle("홍길동", null, "53");

        var roster = eligibleMemberService.listRoster();
        assertThat(roster).singleElement().satisfies(m -> {
            assertThat(m.name()).isEqualTo("홍길동");
            assertThat(m.generation()).isEqualTo("53");
        });
    }

    @Test
    void addGraduateSingleRejectsCurrentStudentYear() {
        // "20" → 2020 > 2019 cutoff → BAD_REQUEST
        assertThatThrownBy(() -> eligibleMemberService.addGraduateSingle("김철수", "20", null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void addGraduateSingleIsIdempotentOnDuplicate() {
        eligibleMemberService.addGraduateSingle("홍길동", "19", null);
        eligibleMemberService.addGraduateSingle("홍길동", "19", null);

        assertThat(eligibleMemberService.listRoster()).hasSize(1);
    }

    @Test
    void addGraduateSingleRejectsInvalidFormat() {
        assertThatThrownBy(() -> eligibleMemberService.addGraduateSingle("홍길동", "abc", null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.addGraduateSingle("홍길동", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void adminUpdateKeepsClaimKeyAlignedWithEditedIdentity() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "53기"}));
        eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "YEAR", "19", null);
        var claimed = eligibleMemberRepository.findByStudentId("2019123456").orElseThrow();

        eligibleMemberService.updateEligibleMember(claimed.getId(), "2018123456", "김철수", null, null, null);

        assertThat(eligibleMemberRepository.findByVerificationKey("김철수|2018")).isPresent();
        assertThat(eligibleMemberRepository.findByVerificationKey("홍길동|2019")).isEmpty();
    }

    @Test
    void adminAddNormalizesDepartmentAndUpdateCanClearIt() {
        eligibleMemberService.addSingle(
                "2026990101", "가상회원", "60", null, "  컴퓨터정보공학부  ", Member.Role.USER);

        var member = eligibleMemberRepository.findByStudentId("2026990101").orElseThrow();
        assertThat(member.getDepartment()).isEqualTo("컴퓨터정보공학부");
        assertThat(eligibleMemberService.listRoster().getFirst().department())
                .isEqualTo("컴퓨터정보공학부");

        eligibleMemberService.updateEligibleMember(
                member.getId(), "2026990101", "가상회원", "60", null, "   ");

        assertThat(eligibleMemberRepository.findByStudentId("2026990101").orElseThrow().getDepartment())
                .isNull();
    }

    @Test
    void adminUpdateKeepsDepartmentWhenNullAndTrimsReplacement() {
        eligibleMemberService.addSingle(
                "2026990101", "가상회원", "60", null, "컴퓨터정보공학부", Member.Role.USER);
        var member = eligibleMemberRepository.findByStudentId("2026990101").orElseThrow();

        eligibleMemberService.updateEligibleMember(
                member.getId(), "2026990101", "가상회원", "60", null, null);

        assertThat(member.getDepartment()).isEqualTo("컴퓨터정보공학부");

        eligibleMemberService.updateEligibleMember(
                member.getId(), "2026990101", "가상회원", "60", null, "  소프트웨어학부  ");

        assertThat(member.getDepartment()).isEqualTo("소프트웨어학부");
    }

    @Test
    void adminAddReplacesExistingDepartment() {
        eligibleMemberService.addSingle(
                "2026990101", "가상전", "60", null, "전자공학과", Member.Role.USER);

        // 같은 학번을 관리자가 다른 사람으로 고쳐 넣으면 학부/학과도 새 값이 맞다.
        eligibleMemberService.addSingle(
                "2026990101", "가상후", "60", null, "로봇학부", Member.Role.USER);
        // 학부/학과 칸을 비워 두면 기존 값은 그대로 둔다.
        eligibleMemberService.addSingle("2026990101", "가상후", "60", null, "   ", Member.Role.USER);

        assertThat(eligibleMemberRepository.findByStudentId("2026990101").orElseThrow().getDepartment())
                .isEqualTo("로봇학부");
    }

    @Test
    void promotionFillsOnlyBlankRosterDepartments() {
        eligibleMemberService.addSingle(
                "2026990101", "가상회원", "60", null, "전자공학과", Member.Role.USER);
        eligibleMemberService.addSingle("2026990102", "가상빈값", "60", null);
        eligibleMemberRepository.findByStudentId("2026990102").orElseThrow().setDepartment("   ");

        eligibleMemberService.addSingle(
                "2026990101", "가상회원", "60", null, "로봇학부", Member.Role.ASSOCIATE, true);
        eligibleMemberService.addSingle(
                "2026990102", "가상빈값", "60", null, "  로봇학부  ", Member.Role.ASSOCIATE, true);
        eligibleMemberService.addSingle(
                "2026990103", "가상신규", "60", null, "  로봇학부  ", Member.Role.ASSOCIATE, true);

        assertThat(eligibleMemberRepository.findByStudentId("2026990101").orElseThrow().getDepartment())
                .isEqualTo("전자공학과");
        assertThat(eligibleMemberRepository.findByStudentId("2026990102").orElseThrow().getDepartment())
                .isEqualTo("로봇학부");
        assertThat(eligibleMemberRepository.findByStudentId("2026990103").orElseThrow().getDepartment())
                .isEqualTo("로봇학부");
    }

    @Test
    void rosterGuardRejectsStudentIdAlreadyHeldByAnotherName() {
        eligibleMemberService.addSingle("2026990101", "가상지원자", "60", "01000000000");

        assertThatThrownBy(() -> eligibleMemberService.ensureStudentIdNotTakenByOtherName("2026990101", "홍길동"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("이미 다른 이름으로 명부에 등록된 학번입니다.");
                });
    }

    @Test
    void rosterGuardAllowsSameNameOrUnknownStudentId() {
        eligibleMemberService.addSingle("2026990101", "가상지원자", "60", "01000000000");

        // 재이관(같은 사람) 과 신규 학번은 통과해야 한다.
        eligibleMemberService.ensureStudentIdNotTakenByOtherName("2026990101", " 가상지원자 ");
        eligibleMemberService.ensureStudentIdNotTakenByOtherName("2026990102", "홍길동");
    }

    @Test
    void importsCsvSavedByExcelWithUtf8Bom() {
        // Excel's "CSV UTF-8" always starts with a BOM; it used to stay glued to the first header,
        // so a file whose first column is 이름 was rejected as having no name column.
        byte[] bytes = "﻿이름,학번,전화번호\n홍길동,2024123456,010-1234-5678\n".getBytes(StandardCharsets.UTF_8);

        var response = eligibleMemberService.importRoster(csvFile(bytes));

        assertThat(response.imported()).isEqualTo(1);
        assertThat(eligibleMemberService.listRoster())
                .singleElement()
                .satisfies(member -> {
                    assertThat(member.name()).isEqualTo("홍길동");
                    assertThat(member.studentId()).isEqualTo("2024123456");
                });
    }

    @Test
    void importsCsvSavedByExcelInKoreanWindowsEncoding() {
        // "CSV (쉼표로 분리)" on Korean Windows is CP949, not UTF-8.
        byte[] bytes = "이름,학번\n김철수,2024123457\n".getBytes(Charset.forName("MS949"));

        var response = eligibleMemberService.importRoster(csvFile(bytes));

        assertThat(response.imported()).isEqualTo(1);
        assertThat(eligibleMemberService.listRoster())
                .singleElement()
                .satisfies(member -> assertThat(member.name()).isEqualTo("김철수"));
    }

    @Test
    void rejectsUploadThatIsNotSpreadsheetAsBadRequest() {
        MockMultipartFile notSpreadsheet = new MockMultipartFile(
                "file",
                "members.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "this is not a workbook".getBytes(StandardCharsets.UTF_8)
        );

        assertThatThrownBy(() -> eligibleMemberService.importRoster(notSpreadsheet))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode().value()).isEqualTo(HttpStatus.BAD_REQUEST.value()));
    }

    @Test
    void signupLookupDoesNotRevealBanToCallerWhoCannotMatchRoster() {
        bannedStudentRepository.save(new BannedStudent("2024777777", null));

        // Not on the roster, wrong everything: the answer must be the same generic roster error an
        // unbanned unknown 학번 gets, not a statement about the ban.
        assertThatThrownBy(() -> eligibleMemberService.prepareSignup(signupRequest("2024777777", "홍길동", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode().value()).isEqualTo(HttpStatus.FORBIDDEN.value());
                    assertThat(ex.getReason()).doesNotContain("제한").doesNotContain("차단");
                });
        assertThatThrownBy(() -> eligibleMemberService.prepareSignup(signupRequest("2024888888", "홍길동", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode().value()).isEqualTo(HttpStatus.FORBIDDEN.value()));
    }

    @Test
    void currentGenerationIsPinnedToTheSignupYear() {
        // 시계가 2026-06-06 에 고정돼 있다. 프런트 currentGeneration() 과 같은 숫자여야 한다.
        assertThat(eligibleMemberService.currentGeneration()).isEqualTo("60");
    }

    @Test
    void blankRosterGenerationFallsBackToAdmissionYear() {
        EligibleMember member = new EligibleMember();
        member.setStudentId("2023203099");
        member.setName("홍길동");
        member.setGeneration(null);
        member.setAdmissionYear(2023);
        eligibleMemberRepository.save(member);

        // 2023 입학이면 57기다. 올해(60기)를 붙이면 안 된다.
        assertThat(eligibleMemberService.prepareSignup(signupRequest("2023203099", "홍길동", null)).generation())
                .isEqualTo("57");
    }

    @Test
    void overlongRosterGenerationFallsBack() {
        EligibleMember member = new EligibleMember();
        member.setStudentId("2023203098");
        member.setName("홍길동");
        member.setGeneration("1".repeat(50));
        member.setAdmissionYear(2023);
        eligibleMemberRepository.save(member);

        // members.generation 은 VARCHAR(10) 이다. 그대로 흘려보내면 저장에서 터진다.
        assertThat(eligibleMemberService.prepareSignup(signupRequest("2023203098", "홍길동", null)).generation())
                .isEqualTo("57");
    }

    @Test
    void importFillsAnEmptyPhoneOnAnExistingRow() throws Exception {
        // 전화번호 없이 먼저 들어온 행.
        eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름"},
                new String[]{"2024123456", "홍길동"}));
        assertThat(eligibleMemberRepository.findByStudentId("2024123456").orElseThrow().getPhone()).isNull();

        var response = eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2024123456", "홍길동", "010-1234-5678"}));

        // 새 행은 아니므로 skipped 에 들어가지만, 비어 있던 전화번호는 채운다.
        assertThat(response.imported()).isZero();
        assertThat(response.skipped()).isEqualTo(1);
        assertThat(response.phoneFilled()).isEqualTo(1);
        assertThat(eligibleMemberRepository.findByStudentId("2024123456").orElseThrow().getPhone())
                .isEqualTo("01012345678");
    }

    @Test
    void importNeverOverwritesAPhoneThatIsAlreadyThere() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2024123456", "홍길동", "010-1111-1111"}));

        var response = eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2024123456", "홍길동", "010-2222-2222"}));

        // 가져오기는 기존 행을 덮어쓰지 않는다. 다른 번호가 올라와도 원래 값이 남는다.
        assertThat(response.phoneFilled()).isZero();
        assertThat(eligibleMemberRepository.findByStudentId("2024123456").orElseThrow().getPhone())
                .isEqualTo("01011111111");
    }

    @Test
    void importNeverTreatsStudentIdHeadersAsDepartment() throws Exception {
        for (String header : new String[]{"학부학번", "학과/학번"}) {
            eligibleMemberRepository.deleteAll();
            var csv = eligibleMemberService.importRoster(csvFile(
                    ("이름," + header + ",학과\n가상회원,2026990101,전자공학과\n").getBytes(StandardCharsets.UTF_8)));
            var xlsx = eligibleMemberService.importRoster(workbookFile(
                    new String[]{"이름", header, "학과"}, new String[]{"가상신규", "2026990102", "로봇학부"}));

            assertThat(csv.imported()).isEqualTo(1);
            assertThat(xlsx.imported()).isEqualTo(1);
            assertThat(eligibleMemberRepository.findByStudentId("2026990101").orElseThrow().getDepartment())
                    .isEqualTo("전자공학과");
            assertThat(eligibleMemberRepository.findByStudentId("2026990102").orElseThrow().getDepartment())
                    .isEqualTo("로봇학부");
        }
    }

    @Test
    void csvImportStoresAndFillsButNeverOverwritesDepartmentFromDepartmentHeader() {
        eligibleMemberService.addSingle("2026990102", "가상빈값", "60", null);
        eligibleMemberService.addSingle("2026990103", "가상유지", "60", null, "전자공학과", Member.Role.USER);

        var response = eligibleMemberService.importRoster(csvFile((
                "이름,기수,과,학번10,학번1,학번20,학번2\n"
                        + "가상신규,60, 컴퓨터정보공학부  ,2026990101,,,\n"
                        + "가상빈값,60, 소프트웨어학부  ,2026990102,,,\n"
                        + "가상유지,60, 로봇학부  ,2026990103,,,\n"
        ).getBytes(StandardCharsets.UTF_8)));

        assertThat(response.imported()).isEqualTo(1);
        assertThat(response.skipped()).isEqualTo(2);
        assertThat(response.departmentFilled()).isEqualTo(1);
        assertThat(eligibleMemberRepository.findByStudentId("2026990101").orElseThrow().getDepartment())
                .isEqualTo("컴퓨터정보공학부");
        assertThat(eligibleMemberRepository.findByStudentId("2026990102").orElseThrow().getDepartment())
                .isEqualTo("소프트웨어학부");
        assertThat(eligibleMemberRepository.findByStudentId("2026990103").orElseThrow().getDepartment())
                .isEqualTo("전자공학과");
    }

    @Test
    void xlsxImportStoresAndFillsButNeverOverwritesDepartmentFromDepartmentHeader() throws Exception {
        eligibleMemberService.addSingle("2026990105", "가상빈값", "60", null);
        eligibleMemberService.addSingle("2026990106", "가상유지", "60", null, "전자공학과", Member.Role.USER);
        String[] headers = {"이름", "기수", "과", "학번10", "학번1", "학번20", "학번2"};

        var created = eligibleMemberService.importRoster(workbookFile(headers,
                new String[]{"가상신규", "60", " 컴퓨터정보공학부  ", "", "2026990104", "", ""}));
        var filled = eligibleMemberService.importRoster(workbookFile(headers,
                new String[]{"가상빈값", "60", " 소프트웨어학부  ", "", "2026990105", "", ""}));
        var preserved = eligibleMemberService.importRoster(workbookFile(headers,
                new String[]{"가상유지", "60", " 로봇학부  ", "", "2026990106", "", ""}));

        assertThat(created.imported()).isEqualTo(1);
        assertThat(filled.departmentFilled()).isEqualTo(1);
        assertThat(preserved.departmentFilled()).isZero();
        assertThat(eligibleMemberRepository.findByStudentId("2026990104").orElseThrow().getDepartment())
                .isEqualTo("컴퓨터정보공학부");
        assertThat(eligibleMemberRepository.findByStudentId("2026990105").orElseThrow().getDepartment())
                .isEqualTo("소프트웨어학부");
        assertThat(eligibleMemberRepository.findByStudentId("2026990106").orElseThrow().getDepartment())
                .isEqualTo("전자공학과");
    }

    @Test
    void csvImportFillsAnEmptyPhoneOnAGraduateRowMatchedByNameAndGeneration() {
        // 졸업생 행은 학번이 없고 이름+입학연도로만 찾힌다.
        eligibleMemberService.addGraduateSingle("홍길동", null, "53");
        assertThat(eligibleMemberRepository.findAllByNameAndAdmissionYear("홍길동", 2019).getFirst().getPhone()).isNull();

        var response = eligibleMemberService.importRoster(csvFile(
                "이름,기수,전화번호\n홍길동,53,010-3333-4444\n".getBytes(java.nio.charset.StandardCharsets.UTF_8)));

        assertThat(response.phoneFilled()).isEqualTo(1);
        assertThat(eligibleMemberRepository.findAllByNameAndAdmissionYear("홍길동", 2019).getFirst().getPhone())
                .isEqualTo("01033334444");
    }

    @Test
    void importDoesNotFillAPhoneWhenTheNameDoesNotMatchTheRosterRow() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름"},
                new String[]{"2024123456", "홍길동"}));

        // 같은 학번, 다른 이름 — 구글 폼에 오타난 학번이 남의 행에 떨어지는 경우.
        var response = eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2024123456", "김철수", "010-1234-5678"}));

        // 채우면 그 번호를 모르는 홍길동이 가입할 때 403 만 받는다.
        assertThat(response.phoneFilled()).isZero();
        assertThat(eligibleMemberRepository.findByStudentId("2024123456").orElseThrow().getPhone()).isNull();
    }

    @Test
    void importDoesNotFillAPhoneThatIsNotAPhoneNumber() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름"},
                new String[]{"2024123456", "홍길동"}));

        // 전화번호 칸에 학번이 들어온 경우. 한번 박히면 가입 때 그대로 요구된다.
        var response = eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2024123456", "홍길동", "2024123456"}));

        assertThat(response.phoneFilled()).isZero();
        assertThat(eligibleMemberRepository.findByStudentId("2024123456").orElseThrow().getPhone()).isNull();
    }

    @Test
    void importLeavesAnEmptyPhoneCellAlone() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름"},
                new String[]{"2024123456", "홍길동"}));

        var response = eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2024123456", "홍길동", ""}));

        assertThat(response.phoneFilled()).isZero();
        assertThat(eligibleMemberRepository.findByStudentId("2024123456").orElseThrow().getPhone()).isNull();
    }

    @Test
    void importDoesNotGiveTwoRowsWithTheSameNameTheSamePhone() throws Exception {
        // 동명이인 둘. 한 명은 이미 그 번호를 들고 있다.
        eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2024123456", "홍길동", "010-1234-5678"}));
        eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름"},
                new String[]{"2025123456", "홍길동"}));

        // 같은 번호를 빈 쪽에 채우면 uk_eligible_members_name_phone(V6) 위반으로
        // 가져오기 전체가 롤백되고 어느 행 때문인지도 안 나온다.
        var response = eligibleMemberService.importRoster(workbookFile(new String[]{"학번", "이름", "전화번호"},
                new String[]{"2025123456", "홍길동", "010-1234-5678"}));

        assertThat(response.phoneFilled()).isZero();
        assertThat(eligibleMemberRepository.findByStudentId("2025123456").orElseThrow().getPhone()).isNull();
        assertThat(eligibleMemberRepository.findByStudentId("2024123456").orElseThrow().getPhone())
                .isEqualTo("01012345678");
    }

    private SignupRequest signupRequest(String studentId, String name, String phone) {
        return new SignupRequest(studentId, name, null, null, "roster-test@example.com", "Password1!",
                null, null, phone, null, null, null);
    }

    private MockMultipartFile csvFile(byte[] bytes) {
        return new MockMultipartFile("file", "members.csv", "text/csv", bytes);
    }

    private MockMultipartFile workbookFile(String[] header, String[] values) throws Exception {
        try (Workbook workbook = new XSSFWorkbook();
             ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("members");
            Row titleRow = sheet.createRow(0);
            titleRow.createCell(0).setCellValue("컴스 회원 명부");
            Row headerRow = sheet.createRow(1);
            Row valueRow = sheet.createRow(2);
            for (int i = 0; i < header.length; i++) {
                headerRow.createCell(i).setCellValue(header[i]);
                valueRow.createCell(i).setCellValue(values[i]);
            }
            workbook.write(outputStream);
            return new MockMultipartFile(
                    "file",
                    "members.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    outputStream.toByteArray()
            );
        }
    }

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.parse("2026-06-06T00:00:00Z"), ZoneId.of("Asia/Seoul"));
        }
    }
}
