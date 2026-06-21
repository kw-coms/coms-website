package com.coms.backend.controller;

import com.coms.backend.dto.RecurringScheduleExceptionRequest;
import com.coms.backend.dto.RecurringScheduleExceptionResponse;
import com.coms.backend.dto.RecurringScheduleRequest;
import com.coms.backend.dto.RecurringScheduleResponse;
import com.coms.backend.dto.ScheduleOccurrenceResponse;
import com.coms.backend.domain.RecurringSchedule;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.RecurringScheduleService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api")
public class RecurringScheduleController {

    private final RecurringScheduleService recurringScheduleService;
    private final AuditLogService auditLogService;

    public RecurringScheduleController(RecurringScheduleService recurringScheduleService,
                                       AuditLogService auditLogService) {
        this.recurringScheduleService = recurringScheduleService;
        this.auditLogService = auditLogService;
    }

    // Expanded recurring occurrences for the displayed month. Readable by any
    // authenticated member (matches the GET /api/club-activities gating).
    @GetMapping("/club-activities/schedule")
    public ResponseEntity<List<ScheduleOccurrenceResponse>> occurrences(
            @RequestParam("year") int year,
            @RequestParam("month") int month) {
        return ResponseEntity.ok(recurringScheduleService.occurrencesForMonth(year, month));
    }

    // Admin-managed CRUD lives under /api/admin/** (guarded globally by hasRole('ADMIN')).
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/recurring-schedules")
    public ResponseEntity<List<RecurringScheduleResponse>> list() {
        return ResponseEntity.ok(recurringScheduleService.list());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/recurring-schedules")
    public ResponseEntity<RecurringScheduleResponse> create(@Valid @RequestBody RecurringScheduleRequest request,
                                                            Authentication authentication) {
        RecurringScheduleResponse response = recurringScheduleService.create(request, authentication.getName());
        auditRecurringSchedule(authentication.getName(), "ADMIN_RECURRING_SCHEDULE_CREATE", response);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/admin/recurring-schedules/{id}")
    public ResponseEntity<RecurringScheduleResponse> update(@PathVariable Long id,
                                                            @Valid @RequestBody RecurringScheduleRequest request,
                                                            Authentication authentication) {
        RecurringScheduleResponse response = recurringScheduleService.update(id, request);
        auditRecurringSchedule(authentication.getName(), "ADMIN_RECURRING_SCHEDULE_UPDATE", response);
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/recurring-schedules/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication authentication) {
        RecurringSchedule schedule = recurringScheduleService.get(id);
        String detail = recurringAuditDetail(
                schedule.getTitle(),
                schedule.getStartDate(),
                schedule.getEndDate(),
                schedule.getStartTime() == null ? null : schedule.getStartTime().toString(),
                schedule.getEndTime() == null ? null : schedule.getEndTime().toString(),
                schedule.getColorHex()
        );
        recurringScheduleService.delete(id);
        auditLogService.record(authentication.getName(), "ADMIN_RECURRING_SCHEDULE_DELETE",
                "RECURRING_SCHEDULE", String.valueOf(id), detail, null);
        return ResponseEntity.noContent().build();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/admin/recurring-schedules/{id}/exceptions/{date}")
    public ResponseEntity<RecurringScheduleExceptionResponse> upsertException(
            @PathVariable Long id,
            @PathVariable LocalDate date,
            @RequestBody RecurringScheduleExceptionRequest request,
            Authentication authentication) {
        RecurringScheduleExceptionResponse response = recurringScheduleService.upsertException(id, date, request);
        auditLogService.record(authentication.getName(), "ADMIN_RECURRING_SCHEDULE_EXCEPTION_UPSERT",
                "RECURRING_SCHEDULE", String.valueOf(id),
                "date=" + auditValue(response.exceptionDate())
                        + ", canceled=" + response.canceled()
                        + ", time=" + auditValue(response.startTime()) + "~" + auditValue(response.endTime()),
                null);
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/recurring-schedules/{id}/exceptions/{date}")
    public ResponseEntity<Void> deleteException(@PathVariable Long id,
                                                @PathVariable LocalDate date,
                                                Authentication authentication) {
        recurringScheduleService.deleteException(id, date);
        auditLogService.record(authentication.getName(), "ADMIN_RECURRING_SCHEDULE_EXCEPTION_DELETE",
                "RECURRING_SCHEDULE", String.valueOf(id), "date=" + auditValue(date), null);
        return ResponseEntity.noContent().build();
    }

    private void auditRecurringSchedule(String actorStudentId, String action, RecurringScheduleResponse response) {
        auditLogService.record(actorStudentId, action, "RECURRING_SCHEDULE", String.valueOf(response.id()),
                recurringAuditDetail(response.title(), response.startDate(), response.endDate(),
                        response.startTime(), response.endTime(), response.colorHex()), null);
    }

    private String recurringAuditDetail(String title, LocalDate startDate, LocalDate endDate,
                                        String startTime, String endTime, String colorHex) {
        return String.join(", ",
                "title=" + auditValue(title),
                "date=" + auditValue(startDate),
                "endDate=" + auditValue(endDate),
                "time=" + auditValue(startTime) + "~" + auditValue(endTime),
                "color=" + auditValue(colorHex)
        );
    }

    private String auditValue(Object value) {
        if (value == null) return "";
        String text = String.valueOf(value).replaceAll("[\\r\\n\\t]+", " ").trim();
        return text.length() > 160 ? text.substring(0, 160) : text;
    }
}
