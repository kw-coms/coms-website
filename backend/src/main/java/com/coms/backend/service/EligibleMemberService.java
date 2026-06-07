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
import java.time.Clock;
import java.time.Year;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Transactional
public class EligibleMemberService {

    private final EligibleMemberRepository eligibleMemberRepository;
    private final com.coms.backend.repository.BannedStudentRepository bannedStudentRepository;
    private final Clock clock;

    private static final Pattern STUDENT_ID_PATTERN = Pattern.compile("\\d{10}");
    private static final Pattern NAME_PATTERN = Pattern.compile("[가-힣]{3}");
    private static final Pattern TWO_DIGIT_YEAR_PATTERN = Pattern.compile("\\d{2}");
    private static final Pattern GENERATION_PATTERN = Pattern.compile("\\d{1,3}");
    private static final int GRADUATE_AFTER_YEARS = 7;
    private static final int FIRST_GENERATION_YEAR = 1966;

    public EligibleMemberService(EligibleMemberRepository eligibleMemberRepository,
                                  com.coms.backend.repository.BannedStudentRepository bannedStudentRepository,
                                  Clock clock) {
        this.eligibleMemberRepository = eligibleMemberRepository;
        this.bannedStudentRepository = bannedStudentRepository;
        this.clock = clock;
    }

    public void addSingle(String studentId, String name) {
        String normalized = normalize(studentId);
        if (!STUDENT_ID_PATTERN.matcher(normalized).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "학번은 숫자 10자리여야 합니다.");
        }
        EligibleMember member = eligibleMemberRepository.findByStudentId(normalized)
                .orElseGet(EligibleMember::new);
        applyExactStudentIdentity(member, normalized, name);
        eligibleMemberRepository.save(member);
    }

    public void addGraduateSingle(String name, String twoDigitYearStr, String generationStr) {
        String normalizedName = normalize(name);

        Integer admissionYear = null;
        if (twoDigitYearStr != null && !twoDigitYearStr.isBlank()) {
            String digits = normalizeGeneration(twoDigitYearStr);
            if (!digits.matches("\\d{2}")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "입학연도는 2자리 숫자여야 합니다. (예: 19)");
            }
            admissionYear = resolveAdmissionYear(Integer.parseInt(digits));
        } else if (generationStr != null && !generationStr.isBlank()) {
            String digits = normalizeGeneration(generationStr);
            if (!digits.matches("\\d{1,3}")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "기수는 숫자여야 합니다.");
            }
            admissionYear = Integer.parseInt(digits) + FIRST_GENERATION_YEAR;
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "입학연도 또는 기수를 입력해주세요.");
        }

        if (!isGraduate(admissionYear)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "졸업생 입학연도를 입력해주세요. (현재 연도 기준 7년 이전)");
        }

        String generation = String.valueOf(admissionYear - FIRST_GENERATION_YEAR);
        String verificationKey = verificationKey(normalizedName, admissionYear);

        if (eligibleMemberRepository.findByVerificationKey(verificationKey).isPresent()) {
            return;
        }

        EligibleMember member = new EligibleMember();
        member.setName(normalizedName);
        member.setStudentId(null);
        member.setAdmissionYear(admissionYear);
        member.setGeneration(generation);
        member.setVerificationKey(verificationKey);
        eligibleMemberRepository.save(member);
    }

    /** Two-digit year to full year: twoDigit <= currentYear%100 → 2000s, else → 1900s. */
    private int resolveAdmissionYear(int twoDigit) {
        int currentTwoDigit = Year.now(clock).getValue() % 100;
        return twoDigit <= currentTwoDigit ? 2000 + twoDigit : 1900 + twoDigit;
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

    public void updateEligibleMember(Long id, String studentId, String name, String phone) {
        EligibleMember member = eligibleMemberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "명부에서 해당 항목을 찾을 수 없습니다."));
        String normalizedStudentId = normalize(studentId);
        if (!normalizedStudentId.isBlank()) {
            applyExactStudentIdentity(member, normalizedStudentId, name);
        } else {
            // Graduate entry: keep existing studentId/admissionYear, only update name
            member.setName(normalize(name));
            if (member.getVerificationKey() != null) {
                member.setVerificationKey(verificationKey(member.getName(), member.getAdmissionYear()));
            }
        }
        String normalizedPhone = normalizePhone(phone);
        member.setPhone(normalizedPhone.isBlank() ? null : normalizedPhone);
        eligibleMemberRepository.save(member);
    }

    public void deleteEligibleMember(Long id) {
        if (!eligibleMemberRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "명부에서 해당 항목을 찾을 수 없습니다.");
        }
        eligibleMemberRepository.deleteById(id);
    }

    public void validateAndClaimSignup(String studentId, String name, String verificationType, String verificationValue) {
        String normalizedStudentId = normalize(studentId);
        String normalizedName = normalize(name);

        if (!STUDENT_ID_PATTERN.matcher(normalizedStudentId).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "학번은 숫자 10자리여야 합니다.");
        }
        if (!NAME_PATTERN.matcher(normalizedName).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름은 한글 3자리여야 합니다.");
        }

        if (bannedStudentRepository.existsByStudentId(normalizedStudentId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "가입이 제한된 학번입니다.");
        }

        Optional<EligibleMember> exact = eligibleMemberRepository.findByStudentId(normalizedStudentId);
        if (exact.isPresent()) {
            if (!exact.get().getName().equals(normalizedName)) {
                throw invalidRoster();
            }
            return;
        }

        int admissionYear = Integer.parseInt(normalizedStudentId.substring(0, 4));
        if (!isGraduate(admissionYear)) {
            throw invalidRoster();
        }

        validateGraduateVerification(verificationType, verificationValue, admissionYear);

        List<EligibleMember> matches = eligibleMemberRepository.findAllByNameAndAdmissionYear(normalizedName, admissionYear);
        if (matches.size() != 1) {
            throw invalidRoster();
        }

        EligibleMember match = matches.getFirst();
        if (match.getStudentId() != null && !match.getStudentId().isBlank()
                && !normalizedStudentId.equals(match.getStudentId())) {
            throw invalidRoster();
        }
        match.setStudentId(normalizedStudentId);
        eligibleMemberRepository.save(match);
    }

    public synchronized EligibleMemberImportResponse importRoster(MultipartFile file) {
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

            if (!colMap.containsKey("name") || (!colMap.containsKey("studentId") && !colMap.containsKey("generation"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CSV에는 이름과 학번 또는 기수 컬럼이 필요합니다.");
            }

            for (CSVRecord record : parser) {
                String name = normalize(safeGet(record, colMap.get("name")));
                if (name.isBlank()) {
                    skipped++;
                    continue;
                }

                String studentId = extractStudentId(normalize(safeGet(record, colMap.get("studentId"))));
                String generation = studentId.isBlank()
                        ? normalizeGeneration(safeGet(record, colMap.get("generation")))
                        : calculateGeneration(studentId);
                Integer admissionYear = admissionYear(studentId, generation);
                if (admissionYear == null) {
                    skipped++;
                    continue;
                }
                String verificationKey = studentId.isBlank() ? verificationKey(name, admissionYear) : null;

                if (findExisting(studentId, verificationKey).isPresent()) {
                    skipped++;
                    continue;
                }

                String phone = colMap.containsKey("phone")
                        ? normalizePhone(safeGet(record, colMap.get("phone")))
                        : null;

                EligibleMember member = new EligibleMember();
                member.setStudentId(studentId.isBlank() ? null : studentId);
                member.setName(name);
                member.setPhone(phone == null || phone.isBlank() ? null : phone);
                member.setGeneration(generation);
                member.setAdmissionYear(admissionYear);
                member.setVerificationKey(verificationKey);
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

            if (!header.containsKey("name") || (!header.containsKey("studentId") && !header.containsKey("generation"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "명부에는 이름과 학번 또는 기수 컬럼이 필요합니다.");
            }

            for (int i = headerRowIndex + 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                String name = normalize(readCell(row, header.get("name"), evaluator));
                if (name.isBlank()) {
                    skipped++;
                    continue;
                }

                String studentId = extractStudentId(normalize(readCell(row, header.get("studentId"), evaluator)));
                String generation = studentId.isBlank()
                        ? normalizeGeneration(readCell(row, header.get("generation"), evaluator))
                        : calculateGeneration(studentId);
                Integer admissionYear = admissionYear(studentId, generation);
                if (admissionYear == null) {
                    skipped++;
                    continue;
                }
                String verificationKey = studentId.isBlank() ? verificationKey(name, admissionYear) : null;

                if (findExisting(studentId, verificationKey).isPresent()) {
                    skipped++;
                    continue;
                }

                String phone = header.containsKey("phone")
                        ? normalizePhone(readCell(row, header.get("phone"), evaluator))
                        : null;
                String note = normalize(readCell(row, header.get("note"), evaluator));

                EligibleMember member = new EligibleMember();
                member.setStudentId(studentId.isBlank() ? null : studentId);
                member.setName(name);
                member.setPhone(phone == null || phone.isBlank() ? null : phone);
                member.setGeneration(generation);
                member.setAdmissionYear(admissionYear);
                member.setVerificationKey(verificationKey);
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

    private Optional<EligibleMember> findExisting(String studentId, String verificationKey) {
        if (studentId != null && !studentId.isBlank()) {
            return eligibleMemberRepository.findByStudentId(studentId);
        }
        if (verificationKey != null && !verificationKey.isBlank()) {
            return eligibleMemberRepository.findByVerificationKey(verificationKey);
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
            return String.valueOf(year - FIRST_GENERATION_YEAR);
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

    private boolean isGraduate(int admissionYear) {
        return admissionYear <= Year.now(clock).getValue() - GRADUATE_AFTER_YEARS;
    }

    private void validateGraduateVerification(String type, String value, int admissionYear) {
        String normalizedType = normalize(type).toUpperCase(Locale.ROOT);
        String normalizedValue = normalizeGeneration(value);
        if ("YEAR".equals(normalizedType)) {
            String expectedYear = String.format(Locale.ROOT, "%02d", admissionYear % 100);
            if (!TWO_DIGIT_YEAR_PATTERN.matcher(normalizedValue).matches() || !expectedYear.equals(normalizedValue)) {
                throw invalidRoster();
            }
            return;
        }
        if ("GENERATION".equals(normalizedType)) {
            String expectedGeneration = String.valueOf(admissionYear - FIRST_GENERATION_YEAR);
            if (!GENERATION_PATTERN.matcher(normalizedValue).matches() || !expectedGeneration.equals(normalizedValue)) {
                throw invalidRoster();
            }
            return;
        }
        throw invalidRoster();
    }

    private String normalizeGeneration(String value) {
        return normalize(value).replaceAll("[^0-9]", "");
    }

    private Integer admissionYear(String studentId, String generation) {
        try {
            if (studentId != null && STUDENT_ID_PATTERN.matcher(studentId).matches()) {
                return Integer.parseInt(studentId.substring(0, 4));
            }
            if (generation != null && GENERATION_PATTERN.matcher(generation).matches()) {
                return Integer.parseInt(generation) + FIRST_GENERATION_YEAR;
            }
            return null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String verificationKey(String name, Integer admissionYear) {
        if (admissionYear == null) return null;
        return normalize(name).toLowerCase(Locale.ROOT) + "|" + admissionYear;
    }

    private void applyExactStudentIdentity(EligibleMember member, String studentId, String name) {
        String normalizedStudentId = normalize(studentId);
        member.setStudentId(normalizedStudentId);
        member.setName(normalize(name));
        member.setGeneration(calculateGeneration(normalizedStudentId));
        member.setAdmissionYear(admissionYear(normalizedStudentId, null));
        if (member.getVerificationKey() != null) {
            member.setVerificationKey(verificationKey(member.getName(), member.getAdmissionYear()));
        }
    }

    private ResponseStatusException invalidRoster() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "명부에 등록된 학번 또는 졸업생 인증 정보와 이름을 확인해주세요.");
    }
}
