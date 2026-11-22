package com.coms.backend.dto;

import com.coms.backend.domain.TeamProjectSubmission.Timing;

import java.time.LocalDateTime;
import java.util.List;

/** 팀 프로젝트(팀프) 요청·응답 모음. */
public final class TeamProjectDto {
    private TeamProjectDto() {}

    public record TeamProjectWrite(String title, String description, Boolean open, Boolean allowLateSubmissions) {}

    public record TeamProjectMilestoneWrite(String title, String description, LocalDateTime startsAt,
                                            LocalDateTime dueAt, Boolean allDay, Boolean submittable) {}

    public record TeamProjectMilestoneOrder(List<Long> ids) {}

    public record TeamProjectTeamWrite(String name, String topic, String intro) {}

    public record TeamProjectMemberAdd(String studentId) {}

    public record TeamProjectSubmissionTimingWrite(Timing timing) {}

    public record TeamProjectSummary(Long id, String title, String description, boolean open,
                                     boolean allowLateSubmissions, Long myTeamId, String myTeamName) {}

    public record TeamProjectMilestoneView(Long id, String title, String description, LocalDateTime startsAt,
                                           LocalDateTime dueAt, boolean allDay, boolean submittable, int position) {}

    /** studentId 는 회장에게만 내려간다. */
    public record TeamProjectMemberView(String studentId, String name, String generation) {}

    public record TeamProjectTeamView(Long id, String name, String topic, String intro,
                                      List<TeamProjectMemberView> members) {}

    public record TeamProjectDetail(Long id, String title, String description, boolean open, boolean allowLateSubmissions,
                                    List<TeamProjectMilestoneView> milestones, List<TeamProjectTeamView> teams,
                                    Long myTeamId, long maxFileBytes, long maxRequestBytes) {}

    public record TeamProjectFileView(Long id, String originalName, String mimeType, Long fileSize, String downloadUrl) {}

    public record TeamProjectSubmissionView(Long id, Long teamId, Long milestoneId, String body, List<String> links,
                                            List<TeamProjectFileView> files, String submittedByName,
                                            LocalDateTime submittedAt, String updatedByName, LocalDateTime updatedAt,
                                            boolean late, boolean editedAfterDue, Timing timing) {}

    /** status: SUBMITTED(제출) / LATE(늦은 제출) / MISSING(미제출) */
    public record TeamProjectBoardCell(Long milestoneId, String status, LocalDateTime submittedAt,
                                       LocalDateTime updatedAt, boolean editedAfterDue, Timing timing) {}

    public record TeamProjectBoardTeam(Long id, String name, String topic, int memberCount,
                                       List<TeamProjectBoardCell> cells) {}

    public record TeamProjectBoard(List<TeamProjectMilestoneView> milestones, List<TeamProjectBoardTeam> teams) {}
}
