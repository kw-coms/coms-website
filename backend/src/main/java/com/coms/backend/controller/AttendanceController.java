package com.coms.backend.controller;

import com.coms.backend.domain.Permission;
import com.coms.backend.dto.AttendanceCheckInRequest;
import com.coms.backend.dto.AttendanceCheckInResponse;
import com.coms.backend.dto.AttendanceDetailResponse;
import com.coms.backend.dto.AttendanceOpenRequest;
import com.coms.backend.dto.AttendanceSessionResponse;
import com.coms.backend.dto.AttendanceSummaryResponse;
import com.coms.backend.service.AttendanceService;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.PermissionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Attendance ("출석 체크"). Every route needs a signed-in member (the security configuration
 * ends in authenticated()). Opening, closing, deleting and seeing who attended (one check, or
 * the summary across checks) need the same right as writing club activities; checking in and
 * the list are for every member.
 */
@RestController
@RequestMapping("/api/attendance")
public class AttendanceController {
    private final AttendanceService attendanceService;
    private final PermissionService permissionService;
    private final AuditLogService auditLogService;

    public AttendanceController(AttendanceService attendanceService,
                                PermissionService permissionService,
                                AuditLogService auditLogService) {
        this.attendanceService = attendanceService;
        this.permissionService = permissionService;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/sessions")
    public ResponseEntity<List<AttendanceSessionResponse>> listAttendanceSessions(Authentication authentication) {
        boolean manager = permissionService.has(authentication, Permission.ACTIVITY_WRITE);
        return ResponseEntity.ok(attendanceService.list(authentication.getName(), manager));
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @PostMapping("/sessions")
    public ResponseEntity<AttendanceSessionResponse> openAttendanceSession(@Valid @RequestBody AttendanceOpenRequest request,
                                                                           Authentication authentication) {
        AttendanceSessionResponse response = attendanceService.open(request, authentication.getName());
        audit(authentication, "ATTENDANCE_SESSION_OPEN", response.id(), "title=" + auditValue(response.title()) + ", minutes=" + request.minutes());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @GetMapping("/sessions/{id}")
    public ResponseEntity<AttendanceDetailResponse> getAttendanceSession(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(attendanceService.detail(id, authentication.getName()));
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @GetMapping("/summary")
    public ResponseEntity<AttendanceSummaryResponse> getAttendanceSummary(Authentication authentication) {
        return ResponseEntity.ok(attendanceService.summary(authentication.getName()));
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @PostMapping("/sessions/{id}/close")
    public ResponseEntity<AttendanceSessionResponse> closeAttendanceSession(@PathVariable Long id, Authentication authentication) {
        AttendanceSessionResponse response = attendanceService.close(id, authentication.getName());
        audit(authentication, "ATTENDANCE_SESSION_CLOSE", id, "title=" + auditValue(response.title()) + ", attendees=" + response.attendeeCount());
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Void> deleteAttendanceSession(@PathVariable Long id, Authentication authentication) {
        AttendanceDetailResponse before = attendanceService.detail(id, authentication.getName());
        attendanceService.delete(id);
        audit(authentication, "ATTENDANCE_SESSION_DELETE", id,
                "title=" + auditValue(before.session().title()) + ", attendees=" + before.session().attendeeCount());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/check-in")
    public ResponseEntity<AttendanceCheckInResponse> checkInToAttendance(@Valid @RequestBody AttendanceCheckInRequest request,
                                                                         Authentication authentication) {
        return ResponseEntity.ok(attendanceService.checkIn(request.code(), authentication.getName()));
    }

    private void audit(Authentication authentication, String action, Long sessionId, String detail) {
        auditLogService.record(authentication.getName(), action, "ATTENDANCE_SESSION", String.valueOf(sessionId), detail, null);
    }

    private String auditValue(Object value) {
        if (value == null) return "";
        String text = String.valueOf(value).replaceAll("[\\r\\n\\t]+", " ").trim();
        return text.length() > 160 ? text.substring(0, 160) : text;
    }
}
