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
    void importsRosterAndValidatesStudentNamePhone() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"학번", "이름", "전화번호", "기수"},
                new String[]{"2024123456", "홍길동", "010-1234-5678", "1기"});

        var response = eligibleMemberService.importRoster(file);

        assertThat(response.imported()).isEqualTo(1);
        eligibleMemberService.validateSignup("2024123456", "홍길동", "01012345678");
        assertThatThrownBy(() -> eligibleMemberService.validateSignup("2024000000", "홍길동", "01012345678"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void supportsCurrentRosterShapeWithoutStudentIdColumn() throws Exception {
        MockMultipartFile file = workbookFile(new String[]{"이름", "전화번호", "기수", "참석 여부"},
                new String[]{"김철수", "010-1111-2222", "2기", "참석"});

        var response = eligibleMemberService.importRoster(file);

        assertThat(response.imported()).isEqualTo(1);
        eligibleMemberService.validateSignup("2024999999", "김철수", "01011112222");
        assertThatThrownBy(() -> eligibleMemberService.validateSignup("2024999999", "김철수", "010-0000-0000"))
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
