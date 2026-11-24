package com.coms.backend.controller;

import com.coms.backend.dto.StudyAttendanceDto;
import com.coms.backend.service.StudyAttendanceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/study-groups/{groupId}")
public class StudyAttendanceController {
    private final StudyAttendanceService service;

    public StudyAttendanceController(StudyAttendanceService service) { this.service = service; }

    @GetMapping("/sessions")
    public List<StudyAttendanceDto.Session> listStudySessions(@PathVariable Long groupId, Authentication auth) {
        return service.list(groupId, auth.getName());
    }

    @PostMapping("/sessions")
    public ResponseEntity<StudyAttendanceDto.Session> createStudySession(@PathVariable Long groupId,
            @Valid @RequestBody StudyAttendanceDto.Write write, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(groupId, write, auth.getName()));
    }

    @GetMapping("/sessions/{sessionId}")
    public StudyAttendanceDto.Session getStudySession(@PathVariable Long groupId, @PathVariable Long sessionId, Authentication auth) {
        return service.get(groupId, sessionId, auth.getName());
    }

    @PutMapping("/sessions/{sessionId}")
    public StudyAttendanceDto.Session editStudySession(@PathVariable Long groupId, @PathVariable Long sessionId,
            @Valid @RequestBody StudyAttendanceDto.Write write, Authentication auth) {
        return service.edit(groupId, sessionId, write, auth.getName());
    }

    @PostMapping("/sessions/{sessionId}/attendance/open")
    public StudyAttendanceDto.Session openStudyAttendance(@PathVariable Long groupId, @PathVariable Long sessionId,
            @Valid @RequestBody StudyAttendanceDto.Open request, Authentication auth) {
        return service.open(groupId, sessionId, request, auth.getName());
    }

    @PostMapping("/sessions/{sessionId}/attendance/close")
    public StudyAttendanceDto.Session closeStudyAttendance(@PathVariable Long groupId, @PathVariable Long sessionId, Authentication auth) {
        return service.close(groupId, sessionId, auth.getName());
    }

    @GetMapping("/sessions/{sessionId}/attendance/roster")
    public StudyAttendanceDto.Roster getStudyRoster(@PathVariable Long groupId, @PathVariable Long sessionId, Authentication auth) {
        return service.roster(groupId, sessionId, auth.getName());
    }

    @PutMapping("/sessions/{sessionId}/attendance/members/{studentId}")
    public StudyAttendanceDto.Roster markStudyAttendance(@PathVariable Long groupId, @PathVariable Long sessionId,
            @PathVariable String studentId, @Valid @RequestBody StudyAttendanceDto.Mark request, Authentication auth) {
        return service.mark(groupId, sessionId, studentId, request, auth.getName());
    }

    @GetMapping("/attendance/rates")
    public List<StudyAttendanceDto.Rate> getStudyAttendanceRates(@PathVariable Long groupId, Authentication auth) {
        return service.rates(groupId, auth.getName());
    }

    @GetMapping(value = "/attendance/rates.csv", produces = "text/csv")
    public ResponseEntity<byte[]> exportStudyAttendanceRates(@PathVariable Long groupId, Authentication auth) {
        byte[] bytes = ("\uFEFF" + service.ratesCsv(groupId, auth.getName())).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok().contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"study-attendance-" + groupId + ".csv\"")
                .body(bytes);
    }
}
