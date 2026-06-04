package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.dto.EligibleMemberResponse;
import com.coms.backend.dto.EligibleMemberImportResponse;
import com.coms.backend.repository.EligibleMemberRepository;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.ss.usermodel.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Transactional
public class EligibleMemberService {

    private final EligibleMemberRepository eligibleMemberRepository;

    private static final Pattern STUDENT_ID_PATTERN = Pattern.compile("\\d{10}");
    private static final Pattern NAME_PATTERN = Pattern.compile("[가-힣]{3}");

    public EligibleMemberService(EligibleMemberRepository eligibleMemberRepository) {
        this.eligibleMemberRepository = eligibleMemberRepository;
    }

    public void addSingle(String studentId, String name) {
        EligibleMember member = eligibleMemberRepository.findByStudentId(studentId)
                .orElseGet(EligibleMember::new);
        member.setStudentId(studentId);
        member.setName(name);
        member.setGeneration(calculateGeneration(studentId));
        eligibleMemberRepository.save(member);
    }

    @Transactional(readOnly = true)
    public List<EligibleMemberResponse> listRoster() {
        return eligibleMemberRepository.findAllByOrderByStudentIdAscNameAsc()
                .stream()
                .map(member -> new EligibleMemberResponse(
                        member.getId(),
                        member.getStudentId(),
                        member.getName(),
                        member.getGeneration(),
                        member.getPhone()
                ))
                .toList();
    }

    public void updateEligibleMember(Long id, String studentId, String name) {
        EligibleMember member = eligibleMemberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "명부에서 해당 항목을 찾을 수 없습니다."));
        member.setStudentId(studentId.trim());
        member.setName(name.trim());
        member.setGeneration(calculateGeneration(studentId.trim()));
        eligibleMemberRepository.save(member);
    }

    public void deleteEligibleMember(Long id) {
        if (!eligibleMemberRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "명부에서 해당 항목을 찾을 수 없습니다.");
        }
        eligibleMemberRepository.deleteById(id);
    }

    @Transactional(readOnly = true)
    public void validateSignup(String studentId, String name) {
        String normalizedStudentId = normalize(studentId);
        String normalizedName = normalize(name);

        if (!STUDENT_ID_PATTERN.matcher(normalizedStudentId).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "학번은 숫자 10자리여야 합니다.");
        }
        if (!NAME_PATTERN.matcher(normalizedName).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름은 한글 3자리여야 합니다.");
        }

        EligibleMember eligibleMember = eligibleMemberRepository.findByStudentId(normalizedStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "명부에 등록된 학번과 이름을 확인해주세요."));

        if (!eligibleMember.getName().equals(normalizedName)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "명부에 등록된 학번과 이름을 확인해주세요.");
        }
    }

    public EligibleMemberImportResponse importRoster(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부 파일을 선택해주세요.");
        }

        String filename = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);

        if (filename.endsWith(".csv") || contentType.contains("csv") || contentType.contains("text/plain")) {
            return importFromCsv(file);
        }
        return importFromXlsx(file);
    }

    // ── CSV (Google Forms export) ─────────────────────────────────────────────

    private EligibleMemberImportResponse importFromCsv(MultipartFile file) {
        int imported = 0;
        int skipped = 0;

        try (InputStreamReader reader = new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8);
             CSVParser parser = CSVFormat.DEFAULT.builder()
                     .setHeader()
                     .setSkipHeaderRecord(true)
                     .setTrim(true)
                     .setIgnoreEmptyLines(true)
                     .build()
                     .parse(reader)) {

            Map<String, String> colMap = buildCsvColumnMap(parser.getHeaderNames());

            if (!colMap.containsKey("name") || !colMap.containsKey("studentId")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CSV에 이름 또는 학번 컬럼이 없습니다.");
            }

            for (CSVRecord record : parser) {
                String name = normalize(safeGet(record, colMap.get("name")));
                if (name.isBlank()) {
                    skipped++;
                    continue;
                }

                String studentId = extractStudentId(normalize(safeGet(record, colMap.get("studentId"))));
                String phone = colMap.containsKey("phone")
                        ? normalizePhone(safeGet(record, colMap.get("phone")))
                        : null;

                EligibleMember member = findExisting(studentId).orElseGet(EligibleMember::new);
                member.setStudentId(studentId.isBlank() ? null : studentId);
                member.setName(name);
                member.setPhone(phone == null || phone.isBlank() ? null : phone);
                member.setGeneration(calculateGeneration(studentId));
                eligibleMemberRepository.save(member);
                imported++;
            }

        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CSV 파일을 읽지 못했습니다.");
        }

        return new EligibleMemberImportResponse(imported, skipped, "명부를 가져왔습니다.");
    }

    private Map<String, String> buildCsvColumnMap(List<String> headerNames) {
        Map<String, String> map = new HashMap<>();
        for (String header : headerNames) {
            String flat = normalize(header).toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
            if (flat.equals("이름") || flat.startsWith("이름")) map.putIfAbsent("name", header);
            if (flat.contains("학번")) map.putIfAbsent("studentId", header);
            if (flat.equals("studentid") || flat.equals("student_id")) map.putIfAbsent("studentId", header);
            if (flat.contains("기수")) map.putIfAbsent("generation", header);
            if (flat.contains("전화")) map.putIfAbsent("phone", header);
            if (flat.equalsIgnoreCase("phone")) map.putIfAbsent("phone", header);
        }
        return map;
    }

    private String safeGet(CSVRecord record, String header) {
        if (header == null) return "";
        try {
            return record.isMapped(header) ? record.get(header) : "";
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    // ── XLSX ─────────────────────────────────────────────────────────────────

    private EligibleMemberImportResponse importFromXlsx(MultipartFile file) {
        int imported = 0;
        int skipped = 0;

        try (InputStream inputStream = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(inputStream)) {

            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
            Sheet sheet = workbook.getSheetAt(0);
            int headerRowIndex = findXlsxHeaderRowIndex(sheet, evaluator);
            Map<String, Integer> header = buildXlsxHeaderMap(sheet.getRow(headerRowIndex), evaluator);

            if (!header.containsKey("name") || !header.containsKey("studentId")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부에는 학번, 이름 컬럼이 필요합니다.");
            }

            for (int i = headerRowIndex + 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                String name = normalize(readCell(row, header.get("name"), evaluator));
                if (name.isBlank()) {
                    skipped++;
                    continue;
                }

                String phone = header.containsKey("phone")
                        ? normalizePhone(readCell(row, header.get("phone"), evaluator))
                        : null;
                String studentId = extractStudentId(normalize(readCell(row, header.get("studentId"), evaluator)));
                String note = normalize(readCell(row, header.get("note"), evaluator));

                EligibleMember member = findExisting(studentId).orElseGet(EligibleMember::new);
                member.setStudentId(studentId.isBlank() ? null : studentId);
                member.setName(name);
                member.setPhone(phone == null || phone.isBlank() ? null : phone);
                member.setGeneration(calculateGeneration(studentId));
                member.setNote(note.isBlank() ? null : note);
                eligibleMemberRepository.save(member);
                imported++;
            }

        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부 파일을 읽지 못했습니다.");
        }

        return new EligibleMemberImportResponse(imported, skipped, "명부를 가져왔습니다.");
    }

    private Map<String, Integer> buildXlsxHeaderMap(Row row, FormulaEvaluator evaluator) {
        Map<String, Integer> header = new HashMap<>();
        for (Cell cell : row) {
            String label = normalize(readCell(row, cell.getColumnIndex(), evaluator)).toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
            if (label.equals("학번") || label.equals("학번1") || label.equals("studentid") || label.equals("student_id")) header.put("studentId", cell.getColumnIndex());
            else if (label.contains("학번")) header.putIfAbsent("studentId", cell.getColumnIndex());
            if (label.equals("이름") || label.equalsIgnoreCase("name")) header.putIfAbsent("name", cell.getColumnIndex());
            if (label.equals("전화번호") || label.contains("전화") || label.equalsIgnoreCase("phone")) header.putIfAbsent("phone", cell.getColumnIndex());
            if (label.contains("기수")) header.putIfAbsent("generation", cell.getColumnIndex());
            if (label.equals("특이사항") || label.equals("비고")) header.putIfAbsent("note", cell.getColumnIndex());
        }
        return header;
    }

    private int findXlsxHeaderRowIndex(Sheet sheet, FormulaEvaluator evaluator) {
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            for (Cell cell : row) {
                String value = normalize(readCell(row, cell.getColumnIndex(), evaluator)).toLowerCase(Locale.ROOT);
                if (value.equals("이름") || value.equalsIgnoreCase("name")) return i;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부 헤더를 찾지 못했습니다.");
    }

    private String readCell(Row row, Integer index, FormulaEvaluator evaluator) {
        if (index == null) return "";
        Cell cell = row.getCell(index);
        if (cell == null) return "";
        DataFormatter formatter = new DataFormatter(Locale.KOREA);
        return formatter.formatCellValue(cell, evaluator);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Optional<EligibleMember> findExisting(String studentId) {
        if (studentId != null && !studentId.isBlank()) {
            return eligibleMemberRepository.findByStudentId(studentId);
        }
        return Optional.empty();
    }

    /** Extract the first 10 digit sequence from a raw student ID string. */
    private String extractStudentId(String raw) {
        if (raw == null || raw.isBlank()) return "";
        Matcher m = STUDENT_ID_PATTERN.matcher(raw.replaceAll("\\s+", ""));
        return m.find() ? m.group() : raw.trim();
    }

    /** Calculate generation from student ID: first 4 digits (year) - 1966. e.g. 2026 → 60 */
    private String calculateGeneration(String studentId) {
        if (studentId == null || studentId.length() < 4) return null;
        try {
            int year = Integer.parseInt(studentId.substring(0, 4));
            return String.valueOf(year - 1966);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizePhone(String value) {
        return normalize(value).replaceAll("[^0-9]", "");
    }
}
