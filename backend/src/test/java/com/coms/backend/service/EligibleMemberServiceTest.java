package com.coms.backend.service;

import com.coms.backend.repository.EligibleMemberRepository;
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

    @BeforeEach
    void setUp() {
        eligibleMemberRepository.deleteAll();
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
                });
        eligibleMemberService.validateAndClaimSignup("2024123456", "홍길동", null, null);
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024000000", "홍길동", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void rejectsWrongName() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"학번", "이름"},
                new String[]{"2024123456", "홍길동"});
        eligibleMemberService.importRoster(file);

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024123456", "김철수", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void rejectsInvalidStudentIdFormat() {
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("123456789", "홍길동", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("12345678901", "홍길동", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("학부2024123456", "홍길동", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void rejectsInvalidNameFormat() {
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024123456", "홍길", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2024123456", "Hong GilDong", null, null))
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

        eligibleMemberService.validateAndClaimSignup("2019123456", "김철수", "YEAR", "19");

        assertThat(eligibleMemberRepository.findByStudentId("2019123456")).isPresent();
        assertThat(eligibleMemberRepository.findByVerificationKey("김철수|2019")).isPresent();
    }

    @Test
    void graduateCanVerifyByGenerationButCurrentStudentCannotUseRelaxedVerification() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "53기"}));
        eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "GENERATION", "53기");

        eligibleMemberRepository.deleteAll();
        eligibleMemberService.importRoster(workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "54기"}));
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2020123456", "홍길동", "GENERATION", "54"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void graduateVerificationMustMatchSubmittedFullStudentId() throws Exception {
        eligibleMemberService.importRoster(workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "53기"}));

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "YEAR", "18"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "GENERATION", "52"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void claimedGraduateRosterCannotBeReusedByAnotherStudentId() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"이름", "기수"}, new String[]{"홍길동", "53기"});
        eligibleMemberService.importRoster(file);
        eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "GENERATION", "53");

        assertThatThrownBy(() -> eligibleMemberService.validateAndClaimSignup("2019999999", "홍길동", "GENERATION", "53"))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(eligibleMemberService.importRoster(file).skipped()).isEqualTo(1);
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
        eligibleMemberService.validateAndClaimSignup("2019123456", "홍길동", "YEAR", "19");
        var claimed = eligibleMemberRepository.findByStudentId("2019123456").orElseThrow();

        eligibleMemberService.updateEligibleMember(claimed.getId(), "2018123456", "김철수", null);

        assertThat(eligibleMemberRepository.findByVerificationKey("김철수|2018")).isPresent();
        assertThat(eligibleMemberRepository.findByVerificationKey("홍길동|2019")).isEmpty();
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
