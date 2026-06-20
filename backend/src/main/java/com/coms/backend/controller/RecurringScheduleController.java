package com.coms.backend.controller;

import com.coms.backend.dto.RecurringScheduleExceptionRequest;
import com.coms.backend.dto.RecurringScheduleExceptionResponse;
import com.coms.backend.dto.RecurringScheduleRequest;
import com.coms.backend.dto.RecurringScheduleResponse;
import com.coms.backend.dto.ScheduleOccurrenceResponse;
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

    public RecurringScheduleController(RecurringScheduleService recurringScheduleService) {
        this.recurringScheduleService = recurringScheduleService;
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
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(recurringScheduleService.create(request, authentication.getName()));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/admin/recurring-schedules/{id}")
    public ResponseEntity<RecurringScheduleResponse> update(@PathVariable Long id,
                                                            @Valid @RequestBody RecurringScheduleRequest request) {
        return ResponseEntity.ok(recurringScheduleService.update(id, request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/recurring-schedules/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        recurringScheduleService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/admin/recurring-schedules/{id}/exceptions/{date}")
    public ResponseEntity<RecurringScheduleExceptionResponse> upsertException(
            @PathVariable Long id,
            @PathVariable LocalDate date,
            @RequestBody RecurringScheduleExceptionRequest request) {
        return ResponseEntity.ok(recurringScheduleService.upsertException(id, date, request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/recurring-schedules/{id}/exceptions/{date}")
    public ResponseEntity<Void> deleteException(@PathVariable Long id,
                                                @PathVariable LocalDate date) {
        recurringScheduleService.deleteException(id, date);
        return ResponseEntity.noContent().build();
    }
}
