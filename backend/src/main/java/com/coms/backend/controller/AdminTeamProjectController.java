package com.coms.backend.controller;

import com.coms.backend.dto.TeamProjectDto.TeamProjectBoard;
import com.coms.backend.dto.TeamProjectDto.TeamProjectMemberAdd;
import com.coms.backend.dto.TeamProjectDto.TeamProjectMemberView;
import com.coms.backend.dto.TeamProjectDto.TeamProjectMilestoneOrder;
import com.coms.backend.dto.TeamProjectDto.TeamProjectMilestoneView;
import com.coms.backend.dto.TeamProjectDto.TeamProjectMilestoneWrite;
import com.coms.backend.dto.TeamProjectDto.TeamProjectSubmissionTimingWrite;
import com.coms.backend.dto.TeamProjectDto.TeamProjectSubmissionView;
import com.coms.backend.dto.TeamProjectDto.TeamProjectSummary;
import com.coms.backend.dto.TeamProjectDto.TeamProjectTeamView;
import com.coms.backend.dto.TeamProjectDto.TeamProjectTeamWrite;
import com.coms.backend.dto.TeamProjectDto.TeamProjectWrite;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.TeamProjectService;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 팀프 관리(회장). 해커톤 관리와 같은 /api/admin/** ADMIN 경계 안에 있다. */
@RestController
@RequestMapping("/api/admin/team-projects")
public class AdminTeamProjectController {
    private final TeamProjectService service;
    private final AuditLogService auditLogService;

    public AdminTeamProjectController(TeamProjectService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @PostMapping
    public ResponseEntity<TeamProjectSummary> create(@RequestBody TeamProjectWrite request, Authentication authentication) {
        TeamProjectSummary created = service.create(request, authentication.getName());
        audit(authentication, "ADMIN_TEAM_PROJECT_CREATE", "TEAM_PROJECT", created.id());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{programId}")
    public TeamProjectSummary update(@PathVariable Long programId, @RequestBody TeamProjectWrite request, Authentication authentication) {
        TeamProjectSummary updated = service.update(programId, request);
        audit(authentication, "ADMIN_TEAM_PROJECT_UPDATE", "TEAM_PROJECT", programId);
        return updated;
    }

    @DeleteMapping("/{programId}")
    @ApiResponse(responseCode = "204", description = "프로그램 삭제(일정·팀·제출·파일 포함)")
    public ResponseEntity<Void> delete(@PathVariable Long programId, Authentication authentication) {
        service.delete(programId);
        audit(authentication, "ADMIN_TEAM_PROJECT_DELETE", "TEAM_PROJECT", programId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{programId}/board")
    public TeamProjectBoard board(@PathVariable Long programId) {
        return service.board(programId);
    }

    @PutMapping("/{programId}/teams/{teamId}/milestones/{milestoneId}/submission/timing")
    public TeamProjectSubmissionView classifySubmission(@PathVariable Long programId, @PathVariable Long teamId,
            @PathVariable Long milestoneId, @RequestBody TeamProjectSubmissionTimingWrite request,
            Authentication authentication) {
        TeamProjectSubmissionView updated = service.classifySubmission(programId, teamId, milestoneId,
                request == null ? null : request.timing(), authentication.getName());
        auditLogService.record(authentication.getName(), "ADMIN_TEAM_PROJECT_SUBMISSION_TIMING", "TEAM_PROJECT_SUBMISSION",
                String.valueOf(updated.id()), "timing=" + updated.timing(), null);
        return updated;
    }

    @PostMapping("/{programId}/milestones")
    public ResponseEntity<TeamProjectMilestoneView> createMilestone(@PathVariable Long programId,
            @RequestBody TeamProjectMilestoneWrite request, Authentication authentication) {
        TeamProjectMilestoneView created = service.createMilestone(programId, request);
        audit(authentication, "ADMIN_TEAM_PROJECT_MILESTONE_CREATE", "TEAM_PROJECT_MILESTONE", created.id());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{programId}/milestones/order")
    public List<TeamProjectMilestoneView> reorder(@PathVariable Long programId,
            @RequestBody TeamProjectMilestoneOrder request, Authentication authentication) {
        List<TeamProjectMilestoneView> ordered = service.reorderMilestones(programId, request);
        audit(authentication, "ADMIN_TEAM_PROJECT_MILESTONE_ORDER", "TEAM_PROJECT", programId);
        return ordered;
    }

    @PutMapping("/{programId}/milestones/{milestoneId}")
    public TeamProjectMilestoneView updateMilestone(@PathVariable Long programId, @PathVariable Long milestoneId,
            @RequestBody TeamProjectMilestoneWrite request, Authentication authentication) {
        TeamProjectMilestoneView updated = service.updateMilestone(programId, milestoneId, request);
        audit(authentication, "ADMIN_TEAM_PROJECT_MILESTONE_UPDATE", "TEAM_PROJECT_MILESTONE", milestoneId);
        return updated;
    }

    @DeleteMapping("/{programId}/milestones/{milestoneId}")
    public ResponseEntity<Void> deleteMilestone(@PathVariable Long programId, @PathVariable Long milestoneId,
            Authentication authentication) {
        service.deleteMilestone(programId, milestoneId);
        audit(authentication, "ADMIN_TEAM_PROJECT_MILESTONE_DELETE", "TEAM_PROJECT_MILESTONE", milestoneId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{programId}/teams")
    public ResponseEntity<TeamProjectTeamView> createTeam(@PathVariable Long programId,
            @RequestBody TeamProjectTeamWrite request, Authentication authentication) {
        TeamProjectTeamView created = service.createTeam(programId, request);
        audit(authentication, "ADMIN_TEAM_PROJECT_TEAM_CREATE", "TEAM_PROJECT_TEAM", created.id());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{programId}/teams/{teamId}")
    public TeamProjectTeamView updateTeam(@PathVariable Long programId, @PathVariable Long teamId,
            @RequestBody TeamProjectTeamWrite request, Authentication authentication) {
        TeamProjectTeamView updated = service.updateTeam(programId, teamId, request);
        audit(authentication, "ADMIN_TEAM_PROJECT_TEAM_UPDATE", "TEAM_PROJECT_TEAM", teamId);
        return updated;
    }

    @DeleteMapping("/{programId}/teams/{teamId}")
    public ResponseEntity<Void> deleteTeam(@PathVariable Long programId, @PathVariable Long teamId,
            Authentication authentication) {
        service.deleteTeam(programId, teamId);
        audit(authentication, "ADMIN_TEAM_PROJECT_TEAM_DELETE", "TEAM_PROJECT_TEAM", teamId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{programId}/teams/{teamId}/members")
    public ResponseEntity<TeamProjectMemberView> addMember(@PathVariable Long programId, @PathVariable Long teamId,
            @RequestBody TeamProjectMemberAdd request, Authentication authentication) {
        TeamProjectMemberView added = service.addMember(programId, teamId, request == null ? null : request.studentId());
        auditLogService.record(authentication.getName(), "ADMIN_TEAM_PROJECT_MEMBER_ADD", "TEAM_PROJECT_TEAM",
                String.valueOf(teamId), "targetStudentId=" + added.studentId(), null);
        return ResponseEntity.status(HttpStatus.CREATED).body(added);
    }

    @DeleteMapping("/{programId}/teams/{teamId}/members/{studentId}")
    public ResponseEntity<Void> removeMember(@PathVariable Long programId, @PathVariable Long teamId,
            @PathVariable String studentId, Authentication authentication) {
        service.removeMember(programId, teamId, studentId);
        auditLogService.record(authentication.getName(), "ADMIN_TEAM_PROJECT_MEMBER_REMOVE", "TEAM_PROJECT_TEAM",
                String.valueOf(teamId), "targetStudentId=" + studentId, null);
        return ResponseEntity.noContent().build();
    }

    private void audit(Authentication authentication, String action, String target, Object id) {
        auditLogService.record(authentication.getName(), action, target, String.valueOf(id), null, null);
    }
}
