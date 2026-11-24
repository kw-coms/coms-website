package com.coms.backend.dto;

import com.coms.backend.domain.AttendanceRecord;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class StudyAttendanceDto {
    private StudyAttendanceDto() {}

    @Schema(name = "StudySessionWrite")
    public record Write(@NotNull LocalDate date, @NotBlank @Size(max = 160) String topic, @Size(max = 5000) String notes) {}
    @Schema(name = "StudyAttendanceOpen")
    public record Open(@NotNull @Min(5) @Max(180) Integer minutes) {}
    @Schema(name = "StudyAttendanceMark")
    public record Mark(@NotNull AttendanceRecord.Status status) {}
    @Schema(name = "StudySessionView")
    public record Session(Long id, Long groupId, int roundNo, LocalDate date, String topic, String notes,
                          Long attendanceSessionId, boolean attendanceOpen, String attendanceCode) {}
    @Schema(name = "StudyAttendanceRosterRow")
    public record RosterRow(String studentId, String name, AttendanceRecord.Status status,
                            AttendanceRecord.Source source, LocalDateTime checkedAt, boolean approvedMember) {}
    @Schema(name = "StudyAttendanceRoster")
    public record Roster(List<RosterRow> members) {}
    @Schema(name = "StudyAttendanceRate")
    public record Rate(String studentId, String name, int attended, int eligible, double rate) {}
}
