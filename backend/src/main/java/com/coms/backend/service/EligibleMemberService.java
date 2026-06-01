package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.dto.EligibleMemberImportResponse;
import com.coms.backend.repository.EligibleMemberRepository;
import org.apache.poi.ss.usermodel.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;

@Service
@Transactional
public class EligibleMemberService {
    private final EligibleMemberRepository eligibleMemberRepository;

    public EligibleMemberService(EligibleMemberRepository eligibleMemberRepository) {
        this.eligibleMemberRepository = eligibleMemberRepository;
    }

    @Transactional(readOnly = true)
    public void validateSignup(String studentId, String name, String phone) {
        String normalizedStudentId = normalize(studentId);
        String normalizedName = normalize(name);
        String normalizedPhone = normalizePhone(phone);

        Optional<EligibleMember> match = Optional.empty();
        if (!normalizedStudentId.isBlank()) {
            match = eligibleMemberRepository.findByStudentId(normalizedStudentId);
        }
        if (match.isEmpty()) {
            match = eligibleMemberRepository.findByNameAndPhone(normalizedName, normalizedPhone);
        }

        EligibleMember eligibleMember = match.orElseThrow(() ->
                new ResponseStatusException(HttpStatus.FORBIDDEN, "명부에 등록된 학번, 이름, 전화번호를 확인해주세요."));

        if (eligibleMember.getStudentId() == null || eligibleMember.getStudentId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "학번이 포함된 명부가 필요합니다.");
        }
        if (!eligibleMember.getStudentId().equals(normalizedStudentId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "명부에 등록된 학번, 이름, 전화번호를 확인해주세요.");
        }
        if (!eligibleMember.getName().equals(normalizedName) || !eligibleMember.getPhone().equals(normalizedPhone)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "명부에 등록된 학번, 이름, 전화번호를 확인해주세요.");
        }
    }

    public EligibleMemberImportResponse importRoster(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부 파일을 선택해주세요.");
        }

        int imported = 0;
        int skipped = 0;
        try (InputStream inputStream = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(inputStream)) {
            Sheet sheet = workbook.getSheetAt(0);
            Map<String, Integer> header = findHeader(sheet);
            if (!header.containsKey("studentId") || !header.containsKey("name") || !header.containsKey("phone")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부에는 학번, 이름, 전화번호 컬럼이 필요합니다.");
            }

            int headerRow = findHeaderRowIndex(sheet);
            for (int i = headerRow + 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                String name = normalize(readCell(row, header.get("name")));
                String phone = normalizePhone(readCell(row, header.get("phone")));
                if (name.isBlank() || phone.isBlank()) {
                    skipped++;
                    continue;
                }

                String studentId = normalize(readCell(row, header.get("studentId")));
                String generation = normalize(readCell(row, header.get("generation")));
                String note = normalize(readCell(row, header.get("note")));

                EligibleMember eligibleMember = findExisting(studentId, name, phone).orElseGet(EligibleMember::new);
                eligibleMember.setStudentId(studentId.isBlank() ? null : studentId);
                eligibleMember.setName(name);
                eligibleMember.setPhone(phone);
                eligibleMember.setGeneration(generation.isBlank() ? null : generation);
                eligibleMember.setNote(note.isBlank() ? null : note);
                eligibleMemberRepository.save(eligibleMember);
                imported++;
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부 파일을 읽지 못했습니다.");
        }

        return new EligibleMemberImportResponse(imported, skipped, "명부를 가져왔습니다.");
    }

    private Optional<EligibleMember> findExisting(String studentId, String name, String phone) {
        if (studentId != null && !studentId.isBlank()) {
            Optional<EligibleMember> byStudentId = eligibleMemberRepository.findByStudentId(studentId);
            if (byStudentId.isPresent()) return byStudentId;
        }
        return eligibleMemberRepository.findByNameAndPhone(name, phone);
    }

    private Map<String, Integer> findHeader(Sheet sheet) {
        Row row = sheet.getRow(findHeaderRowIndex(sheet));
        Map<String, Integer> header = new HashMap<>();
        for (Cell cell : row) {
            String label = normalize(cell.getStringCellValue());
            if (List.of("학번", "studentid", "student_id").contains(label.toLowerCase(Locale.ROOT))) header.put("studentId", cell.getColumnIndex());
            if (label.equals("이름") || label.equalsIgnoreCase("name")) header.put("name", cell.getColumnIndex());
            if (label.equals("전화번호") || label.equals("전화") || label.equalsIgnoreCase("phone")) header.put("phone", cell.getColumnIndex());
            if (label.equals("기수")) header.put("generation", cell.getColumnIndex());
            if (label.equals("특이사항") || label.equals("비고")) header.put("note", cell.getColumnIndex());
        }
        return header;
    }

    private int findHeaderRowIndex(Sheet sheet) {
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            boolean hasName = false;
            boolean hasPhone = false;
            for (Cell cell : row) {
                String value = normalize(readCell(row, cell.getColumnIndex()));
                hasName = hasName || value.equals("이름");
                hasPhone = hasPhone || value.equals("전화번호") || value.equals("전화");
            }
            if (hasName && hasPhone) return i;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부 헤더를 찾지 못했습니다.");
    }

    private String readCell(Row row, Integer index) {
        if (index == null) return "";
        Cell cell = row.getCell(index);
        if (cell == null) return "";
        DataFormatter formatter = new DataFormatter(Locale.KOREA);
        return formatter.formatCellValue(cell);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizePhone(String value) {
        return normalize(value).replaceAll("[^0-9]", "");
    }
}
