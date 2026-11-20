package com.coms.backend.controller;

import com.coms.backend.dto.TeamProjectDto.TeamProjectDetail;
import com.coms.backend.dto.TeamProjectDto.TeamProjectSubmissionView;
import com.coms.backend.dto.TeamProjectDto.TeamProjectSummary;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.TeamProjectService;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** 로그인한 회원용 팀프: 일정·팀 목록 열람, 팀원의 제출, 팀원·회장의 파일 내려받기. */
@RestController
@RequestMapping("/api/team-projects")
public class TeamProjectController {
    private final TeamProjectService service;
    private final AuditLogService auditLogService;

    public TeamProjectController(TeamProjectService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<TeamProjectSummary> list(Authentication authentication) {
        return service.list(authentication.getName());
    }

    @GetMapping("/{programId}")
    public TeamProjectDetail detail(@PathVariable Long programId, Authentication authentication) {
        return service.detail(programId, authentication.getName());
    }

    @GetMapping("/{programId}/teams/{teamId}/submissions")
    public List<TeamProjectSubmissionView> submissions(@PathVariable Long programId, @PathVariable Long teamId,
                                                       Authentication authentication) {
        return service.teamSubmissions(programId, teamId, authentication.getName());
    }

    /** 본문·링크를 통째로 바꾸고, 파일은 files 로 더하고 removeFileIds 로 뺀다. 없으면 새로 만든다. */
    @PutMapping(value = "/{programId}/teams/{teamId}/milestones/{milestoneId}/submission",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TeamProjectSubmissionView submit(@PathVariable Long programId, @PathVariable Long teamId,
                                            @PathVariable Long milestoneId,
                                            @RequestParam(required = false) String body,
                                            @RequestParam(required = false) List<String> links,
                                            @RequestParam(required = false) List<MultipartFile> files,
                                            @RequestParam(required = false) List<Long> removeFileIds,
                                            Authentication authentication) {
        TeamProjectSubmissionView saved = service.submit(programId, teamId, milestoneId, authentication.getName(),
                body, links, files, removeFileIds);
        auditLogService.record(authentication.getName(), "TEAM_PROJECT_SUBMIT", "TEAM_PROJECT_SUBMISSION",
                String.valueOf(saved.id()), "programId=" + programId + ", teamId=" + teamId + ", milestoneId=" + milestoneId, null);
        return saved;
    }

    @DeleteMapping("/{programId}/teams/{teamId}/milestones/{milestoneId}/submission")
    @ApiResponse(responseCode = "204", description = "제출 삭제")
    public ResponseEntity<Void> deleteSubmission(@PathVariable Long programId, @PathVariable Long teamId,
                                                 @PathVariable Long milestoneId, Authentication authentication) {
        service.deleteSubmission(programId, teamId, milestoneId, authentication.getName());
        auditLogService.record(authentication.getName(), "TEAM_PROJECT_SUBMISSION_DELETE", "TEAM_PROJECT_TEAM",
                String.valueOf(teamId), "programId=" + programId + ", milestoneId=" + milestoneId, null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{programId}/teams/{teamId}/milestones/{milestoneId}/submission/files/{fileId}")
    public ResponseEntity<Resource> download(@PathVariable Long programId, @PathVariable Long teamId,
                                             @PathVariable Long milestoneId, @PathVariable Long fileId,
                                             Authentication authentication) {
        return service.download(programId, teamId, milestoneId, fileId, authentication.getName());
    }
}
