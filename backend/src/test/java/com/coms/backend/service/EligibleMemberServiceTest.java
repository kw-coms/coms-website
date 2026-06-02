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
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = "jwt.secret=test-secret-key-with-at-least-32-chars")
@Transactional
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
        eligibleMemberService.validateSignup("2024123456", "홍길동");
        assertThatThrownBy(() -> eligibleMemberService.validateSignup("2024000000", "홍길동"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void rejectsWrongName() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"학번", "이름"},
                new String[]{"2024123456", "홍길동"});
        eligibleMemberService.importRoster(file);

        assertThatThrownBy(() -> eligibleMemberService.validateSignup("2024123456", "김철수"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void rejectsInvalidStudentIdFormat() {
        assertThatThrownBy(() -> eligibleMemberService.validateSignup("123456789", "홍길동"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateSignup("12345678901", "홍길동"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateSignup("학부2024123456", "홍길동"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void rejectsInvalidNameFormat() {
        assertThatThrownBy(() -> eligibleMemberService.validateSignup("2024123456", "홍길"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());

        assertThatThrownBy(() -> eligibleMemberService.validateSignup("2024123456", "Hong GilDong"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    void rejectsRosterWithoutStudentIdColumn() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"이름", "전화번호", "기수", "참석 여부"},
                new String[]{"김철수", "010-1111-2222", "2기", "참석"});

        assertThatThrownBy(() -> eligibleMemberService.importRoster(file))
                .isInstanceOf(ResponseStatusException.class);
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
}
