package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.TeamProject;
import com.coms.backend.domain.TeamProjectMember;
import com.coms.backend.domain.TeamProjectMilestone;
import com.coms.backend.domain.TeamProjectSubmission;
import com.coms.backend.domain.TeamProjectSubmissionFile;
import com.coms.backend.domain.TeamProjectSubmissionLink;
import com.coms.backend.domain.TeamProjectTeam;
import com.coms.backend.dto.TeamProjectDto.*;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.TeamProjectMemberRepository;
import com.coms.backend.repository.TeamProjectMilestoneRepository;
import com.coms.backend.repository.TeamProjectRepository;
import com.coms.backend.repository.TeamProjectSubmissionFileRepository;
import com.coms.backend.repository.TeamProjectSubmissionLinkRepository;
import com.coms.backend.repository.TeamProjectSubmissionRepository;
import com.coms.backend.repository.TeamProjectTeamRepository;
import com.coms.backend.web.SafeMediaTypes;
import org.springframework.core.io.Resource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.util.unit.DataSize;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 팀 프로젝트(팀프). 쓰기는 회장(컨트롤러 URL 규칙), 제출은 팀원만, 읽기는 로그인한 회원이다.
 * 제출 형식은 일부러 고정하지 않는다 — 본문·링크·파일에 종류·개수 제한을 두지 않고,
 * 업로드 용량은 멀티파트 설정과 저장소 여유 공간 점검이 정한다.
 */
@Service
public class TeamProjectService {
    static final int MAX_BODY = 20_000;
    static final int MAX_LINK = 2_000;
    private static final String STORED_EXTENSION = "bin";

    private final TeamProjectRepository programs;
    private final TeamProjectMilestoneRepository milestones;
    private final TeamProjectTeamRepository teams;
    private final TeamProjectMemberRepository teamMembers;
    private final TeamProjectSubmissionRepository submissions;
    private final TeamProjectSubmissionLinkRepository links;
    private final TeamProjectSubmissionFileRepository files;
    private final MemberRepository members;
    private final StorageService storage;
    private final Clock clock;
    private final TransactionTemplate transactions;
    private final long maxFileBytes;
    private final long maxRequestBytes;

    public TeamProjectService(TeamProjectRepository programs, TeamProjectMilestoneRepository milestones,
                              TeamProjectTeamRepository teams, TeamProjectMemberRepository teamMembers,
                              TeamProjectSubmissionRepository submissions, TeamProjectSubmissionLinkRepository links,
                              TeamProjectSubmissionFileRepository files, MemberRepository members,
                              StorageService storage, Clock clock, PlatformTransactionManager transactionManager,
                              @Value("${spring.servlet.multipart.max-file-size:310MB}") DataSize maxFile,
                              @Value("${spring.servlet.multipart.max-request-size:320MB}") DataSize maxRequest) {
        this.programs = programs;
        this.milestones = milestones;
        this.teams = teams;
        this.teamMembers = teamMembers;
        this.submissions = submissions;
        this.links = links;
        this.files = files;
        this.members = members;
        this.storage = storage;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
        this.maxFileBytes = maxFile.toBytes();
        this.maxRequestBytes = maxRequest.toBytes();
    }

    /** 모든 시각은 한국 시간(서버 시간대와 무관)의 벽시계 값으로 저장하고 비교한다. */
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private LocalDateTime now() {
        return LocalDateTime.now(clock.withZone(SEOUL));
    }

    // ---- 프로그램 -------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<TeamProjectSummary> list(String viewer) {
        Map<Long, TeamProjectTeam> mine = teams.findAllById(
                teamMembers.findByStudentId(viewer).stream().map(TeamProjectMember::getTeamId).toList())
                .stream().collect(Collectors.toMap(TeamProjectTeam::getProgramId, Function.identity(), (a, b) -> a));
        return programs.findAllByOrderByIdDesc().stream().map(program -> {
            TeamProjectTeam team = mine.get(program.getId());
            return new TeamProjectSummary(program.getId(), program.getTitle(), program.getDescription(), program.isOpen(),
                    team == null ? null : team.getId(), team == null ? null : team.getName());
        }).toList();
    }

    @Transactional(readOnly = true)
    public TeamProjectDetail detail(Long programId, String viewer) {
        TeamProject program = requireProgram(programId);
        boolean admin = isAdmin(viewer);
        List<TeamProjectTeam> teamRows = teams.findByProgramIdOrderByIdAsc(programId);
        List<TeamProjectMember> memberRows = teamMembers.findByProgramIdOrderByIdAsc(programId);
        Map<String, Member> people = members.findByStudentIdIn(memberRows.stream().map(TeamProjectMember::getStudentId).toList())
                .stream().collect(Collectors.toMap(Member::getStudentId, Function.identity()));
        Long myTeamId = memberRows.stream().filter(row -> row.getStudentId().equals(viewer))
                .map(TeamProjectMember::getTeamId).findFirst().orElse(null);
        List<TeamProjectTeamView> teamViews = teamRows.stream().map(team -> new TeamProjectTeamView(
                team.getId(), team.getName(), team.getTopic(), team.getIntro(),
                memberRows.stream().filter(row -> row.getTeamId().equals(team.getId())).map(row -> {
                    Member person = people.get(row.getStudentId());
                    return new TeamProjectMemberView(admin ? row.getStudentId() : null,
                            person == null ? row.getStudentId() : person.getName(),
                            person == null ? null : person.getGeneration());
                }).toList())).toList();
        return new TeamProjectDetail(program.getId(), program.getTitle(), program.getDescription(), program.isOpen(),
                milestones.findByProgramIdOrderByPositionAscIdAsc(programId).stream().map(TeamProjectService::view).toList(),
                teamViews, myTeamId, maxFileBytes, maxRequestBytes);
    }

    @Transactional
    public TeamProjectSummary create(TeamProjectWrite write, String actor) {
        TeamProject program = new TeamProject();
        program.setTitle(required(write == null ? null : write.title(), 120, "제목"));
        program.setDescription(optional(write.description(), 5000, "설명"));
        program.setOpen(write.open() == null || write.open());
        program.setCreatedBy(actor);
        program.setCreatedAt(now());
        program.setUpdatedAt(now());
        programs.saveAndFlush(program);
        return new TeamProjectSummary(program.getId(), program.getTitle(), program.getDescription(), program.isOpen(), null, null);
    }

    @Transactional
    public TeamProjectSummary update(Long programId, TeamProjectWrite write) {
        TeamProject program = requireProgram(programId);
        program.setTitle(required(write == null ? null : write.title(), 120, "제목"));
        program.setDescription(optional(write.description(), 5000, "설명"));
        if (write.open() != null) program.setOpen(write.open());
        program.setUpdatedAt(now());
        programs.saveAndFlush(program);
        return new TeamProjectSummary(program.getId(), program.getTitle(), program.getDescription(), program.isOpen(), null, null);
    }

    @Transactional
    public void delete(Long programId) {
        lockProgram(programId);
        lockAllTeams(programId);   // 진행 중인 제출이 끝난 뒤에 지울 목록을 만든다
        TeamProject program = requireProgram(programId);
        List<String> stored = purge(submissions.findByProgramId(programId));
        teamMembers.deleteAll(teamMembers.findByProgramIdOrderByIdAsc(programId));
        teams.deleteAll(teams.findByProgramIdOrderByIdAsc(programId));
        milestones.deleteAll(milestones.findByProgramIdOrderByPositionAscIdAsc(programId));
        programs.delete(program);
        programs.flush();
        deleteAfterCommit(stored);
    }

    // ---- 일정 -----------------------------------------------------------------------------

    @Transactional
    public TeamProjectMilestoneView createMilestone(Long programId, TeamProjectMilestoneWrite write) {
        requireProgram(programId);
        TeamProjectMilestone milestone = new TeamProjectMilestone();
        milestone.setProgramId(programId);
        apply(milestone, write);
        milestone.setPosition(milestones.findByProgramIdOrderByPositionAscIdAsc(programId).stream()
                .mapToInt(TeamProjectMilestone::getPosition).max().orElse(-1) + 1);
        milestones.saveAndFlush(milestone);
        return view(milestone);
    }

    @Transactional
    public TeamProjectMilestoneView updateMilestone(Long programId, Long milestoneId, TeamProjectMilestoneWrite write) {
        TeamProjectMilestone milestone = requireMilestone(programId, milestoneId);
        apply(milestone, write);
        milestones.saveAndFlush(milestone);
        return view(milestone);
    }

    @Transactional
    public List<TeamProjectMilestoneView> reorderMilestones(Long programId, TeamProjectMilestoneOrder order) {
        requireProgram(programId);
        List<TeamProjectMilestone> rows = milestones.findByProgramIdOrderByPositionAscIdAsc(programId);
        List<Long> ids = order == null || order.ids() == null ? List.of() : order.ids();
        if (ids.size() != rows.size() || !new HashSet<>(ids).equals(rows.stream().map(TeamProjectMilestone::getId).collect(Collectors.toSet()))) {
            throw bad("일정 순서에 모든 일정이 한 번씩 들어 있어야 합니다.");
        }
        Map<Long, TeamProjectMilestone> byId = rows.stream().collect(Collectors.toMap(TeamProjectMilestone::getId, Function.identity()));
        for (int i = 0; i < ids.size(); i++) byId.get(ids.get(i)).setPosition(i);
        milestones.saveAllAndFlush(rows);
        return rows.stream().sorted(java.util.Comparator.comparingInt(TeamProjectMilestone::getPosition)).map(TeamProjectService::view).toList();
    }

    @Transactional
    public void deleteMilestone(Long programId, Long milestoneId) {
        lockProgram(programId);
        lockAllTeams(programId);
        TeamProjectMilestone milestone = requireMilestone(programId, milestoneId);
        List<String> stored = purge(submissions.findByMilestoneId(milestoneId));
        milestones.delete(milestone);
        milestones.flush();
        deleteAfterCommit(stored);
    }

    private void apply(TeamProjectMilestone milestone, TeamProjectMilestoneWrite write) {
        if (write == null) throw bad("일정 내용을 입력해 주세요.");
        milestone.setTitle(required(write.title(), 120, "일정 이름"));
        milestone.setDescription(optional(write.description(), 2000, "일정 설명"));
        if (write.startsAt() != null && write.dueAt() != null
                && (Boolean.TRUE.equals(write.allDay()) ? write.dueAt().toLocalDate().isBefore(write.startsAt().toLocalDate()) : write.dueAt().isBefore(write.startsAt()))) {
            throw bad("종료는 시작보다 빠를 수 없습니다.");
        }
        boolean allDay = Boolean.TRUE.equals(write.allDay());
        milestone.setAllDay(allDay);
        milestone.setStartsAt(allDay && write.startsAt() != null ? write.startsAt().toLocalDate().atStartOfDay() : write.startsAt());
        milestone.setDueAt(allDay && write.dueAt() != null ? write.dueAt().toLocalDate().atStartOfDay() : write.dueAt());
        milestone.setSubmittable(Boolean.TRUE.equals(write.submittable()));
    }

    // ---- 팀·팀원 --------------------------------------------------------------------------

    @Transactional
    public TeamProjectTeamView createTeam(Long programId, TeamProjectTeamWrite write) {
        lockProgram(programId);
        String name = required(write == null ? null : write.name(), 60, "팀 이름");
        if (teams.existsByProgramIdAndNameIgnoreCase(programId, name)) throw conflict("같은 이름의 팀이 이미 있습니다.");
        TeamProjectTeam team = new TeamProjectTeam();
        team.setProgramId(programId);
        team.setName(name);
        team.setTopic(optional(write.topic(), 200, "주제"));
        team.setIntro(optional(write.intro(), 2000, "소개"));
        teams.saveAndFlush(team);
        return new TeamProjectTeamView(team.getId(), team.getName(), team.getTopic(), team.getIntro(), List.of());
    }

    @Transactional
    public TeamProjectTeamView updateTeam(Long programId, Long teamId, TeamProjectTeamWrite write) {
        lockProgram(programId);
        TeamProjectTeam team = requireTeam(programId, teamId);
        String name = required(write == null ? null : write.name(), 60, "팀 이름");
        if (teams.existsByProgramIdAndNameIgnoreCaseAndIdNot(programId, name, teamId)) throw conflict("같은 이름의 팀이 이미 있습니다.");
        team.setName(name);
        team.setTopic(optional(write.topic(), 200, "주제"));
        team.setIntro(optional(write.intro(), 2000, "소개"));
        teams.saveAndFlush(team);
        return new TeamProjectTeamView(team.getId(), team.getName(), team.getTopic(), team.getIntro(),
                memberViews(teamMembers.findByProgramIdOrderByIdAsc(programId).stream().filter(row -> row.getTeamId().equals(teamId)).toList(), true));
    }

    @Transactional
    public void deleteTeam(Long programId, Long teamId) {
        lockProgram(programId);
        lockTeam(programId, teamId);
        TeamProjectTeam team = requireTeam(programId, teamId);
        List<String> stored = purge(submissions.findByTeamIdOrderByIdAsc(teamId));
        teamMembers.deleteAll(teamMembers.findByTeamId(teamId));
        teams.delete(team);
        teams.flush();
        deleteAfterCommit(stored);
    }

    @Transactional
    public TeamProjectMemberView addMember(Long programId, Long teamId, String studentId) {
        lockProgram(programId);
        lockTeam(programId, teamId);
        String id = studentId == null ? "" : studentId.trim();
        Member person = members.findByStudentId(id).orElseThrow(() -> notFound("동아리 회원 중에서 찾을 수 없습니다."));
        if (teamMembers.findByProgramIdAndStudentId(programId, id).isPresent()) {
            throw conflict("이미 이 프로그램의 팀에 속한 회원입니다.");
        }
        TeamProjectMember row = new TeamProjectMember();
        row.setProgramId(programId);
        row.setTeamId(teamId);
        row.setStudentId(id);
        try {
            teamMembers.saveAndFlush(row);
        } catch (DataIntegrityViolationException ex) {
            throw conflict("이미 이 프로그램의 팀에 속한 회원입니다.");
        }
        return new TeamProjectMemberView(person.getStudentId(), person.getName(), person.getGeneration());
    }

    @Transactional
    public void removeMember(Long programId, Long teamId, String studentId) {
        lockProgram(programId);
        lockTeam(programId, teamId);
        TeamProjectMember row = teamMembers.findByTeamIdAndStudentId(teamId, studentId).orElseThrow(() -> notFound("팀원을 찾을 수 없습니다."));
        teamMembers.delete(row);
    }

    // ---- 제출 현황 ------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public TeamProjectBoard board(Long programId) {
        requireProgram(programId);
        List<TeamProjectMilestone> columns = milestones.findByProgramIdOrderByPositionAscIdAsc(programId).stream()
                .filter(TeamProjectMilestone::isSubmittable).toList();
        Map<String, TeamProjectSubmission> byCell = submissions.findByProgramId(programId).stream()
                .collect(Collectors.toMap(s -> s.getTeamId() + ":" + s.getMilestoneId(), Function.identity()));
        Map<Long, Long> sizes = teamMembers.findByProgramIdOrderByIdAsc(programId).stream()
                .collect(Collectors.groupingBy(TeamProjectMember::getTeamId, Collectors.counting()));
        List<TeamProjectBoardTeam> rows = teams.findByProgramIdOrderByIdAsc(programId).stream().map(team ->
                new TeamProjectBoardTeam(team.getId(), team.getName(), team.getTopic(), sizes.getOrDefault(team.getId(), 0L).intValue(),
                        columns.stream().map(column -> {
                            TeamProjectSubmission found = byCell.get(team.getId() + ":" + column.getId());
                            if (found == null) return new TeamProjectBoardCell(column.getId(), "MISSING", null, null, false);
                            return new TeamProjectBoardCell(column.getId(), isLate(found, column) ? "LATE" : "SUBMITTED",
                                    found.getSubmittedAt(), found.getUpdatedAt(), isAfterDue(found.getUpdatedAt(), column));
                        }).toList())).toList();
        return new TeamProjectBoard(columns.stream().map(TeamProjectService::view).toList(), rows);
    }

    @Transactional(readOnly = true)
    public List<TeamProjectSubmissionView> teamSubmissions(Long programId, Long teamId, String viewer) {
        requireProgram(programId);
        requireTeam(programId, teamId);
        requireReader(teamId, viewer);
        List<TeamProjectSubmission> rows = submissions.findByTeamIdOrderByIdAsc(teamId);
        Map<Long, TeamProjectMilestone> due = milestoneMap(programId);
        return views(rows, due, programId);
    }

    // ---- 제출 -----------------------------------------------------------------------------

    /** 저장소에 먼저 올려 둔 업로드 한 건. 표시용 메타데이터만 클라이언트 값이고 저장 이름은 서버가 만든다. */
    private record StoredUpload(String storedName, String originalName, String mimeType, long size) {}

    /**
     * 제출은 세 단계다. (a) 트랜잭션 밖에서 값싼 검증을 하고 파일을 저장소에 먼저 복사한다 — 디스크 복사 동안
     * DB 연결도 행 잠금도 잡지 않는다. (b) 짧은 트랜잭션에서 팀 행만 잠그고 다시 검증한 뒤 올려 둔 파일을 붙인다.
     * (c) 어느 단계든 실패하면 (a)에서 저장한 파일을 지운다. 빼기로 한 파일은 커밋 뒤에 지운다.
     */
    public TeamProjectSubmissionView submit(Long programId, Long teamId, Long milestoneId, String viewer, String body,
                                            List<String> linkInputs, List<MultipartFile> uploads, List<Long> removeFileIds) {
        Member actor = requireMember(viewer);
        requireSubmitter(programId, teamId, milestoneId, viewer);
        String text = body == null ? "" : body.strip();
        if (text.length() > MAX_BODY) throw bad("본문은 " + MAX_BODY + "자까지 쓸 수 있습니다.");
        List<String> urls = normalizeLinks(linkInputs);
        List<MultipartFile> incoming = uploads == null ? List.of() : uploads.stream().filter(file -> file != null).toList();
        for (MultipartFile file : incoming) {
            if (file.isEmpty()) throw bad("빈 파일은 올릴 수 없습니다.");
        }

        List<StoredUpload> stored = new ArrayList<>();
        try {
            for (MultipartFile upload : incoming) {
                // 저장 이름은 서버가 만든다. 클라이언트가 보낸 파일명은 표시용 메타데이터일 뿐 경로에 쓰지 않는다.
                stored.add(new StoredUpload(storage.store(upload, STORED_EXTENSION), safeFilename(upload.getOriginalFilename()),
                        storedMime(upload.getContentType()), upload.getSize()));
            }
            return transactions.execute(status -> attach(programId, teamId, milestoneId, actor, text, urls, stored, removeFileIds));
        } catch (IOException ex) {
            stored.forEach(upload -> deleteQuietly(upload.storedName()));
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "파일을 저장하지 못했습니다.", ex);
        } catch (RuntimeException ex) {
            stored.forEach(upload -> deleteQuietly(upload.storedName()));
            throw ex;
        }
    }

    /** 잠금 전 검사와 잠근 뒤 재검사가 같은 규칙을 쓰도록 한곳에 둔다. 팀원만, 제출을 받는 일정만, 열린 프로그램만. */
    private TeamProjectMilestone requireSubmitter(Long programId, Long teamId, Long milestoneId, String viewer) {
        TeamProject program = requireProgram(programId);
        requireTeam(programId, teamId);
        TeamProjectMilestone milestone = requireMilestone(programId, milestoneId);
        if (!teamMembers.existsByTeamIdAndStudentId(teamId, viewer)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!milestone.isSubmittable()) throw conflict("이 일정은 제출을 받지 않습니다.");
        if (!program.isOpen()) throw conflict("마감된 프로그램에는 제출할 수 없습니다.");
        return milestone;
    }

    private TeamProjectSubmissionView attach(Long programId, Long teamId, Long milestoneId, Member actor, String text,
                                             List<String> urls, List<StoredUpload> incoming, List<Long> removeFileIds) {
        lockTeam(programId, teamId);   // 같은 팀의 제출·삭제·팀원 변경만 한 줄로 세운다
        TeamProjectMilestone milestone = requireSubmitter(programId, teamId, milestoneId, actor.getStudentId());

        TeamProjectSubmission submission = submissions.findByTeamIdAndMilestoneId(teamId, milestoneId).orElse(null);
        List<TeamProjectSubmissionFile> current = submission == null ? List.of()
                : files.findBySubmissionIdInOrderByIdAsc(List.of(submission.getId()));
        Set<Long> remove = new LinkedHashSet<>(removeFileIds == null ? List.of() : removeFileIds);
        List<TeamProjectSubmissionFile> removed = current.stream().filter(file -> remove.contains(file.getId())).toList();
        if (removed.size() != remove.size()) throw bad("삭제할 파일을 찾을 수 없습니다.");
        if (text.isEmpty() && urls.isEmpty() && incoming.isEmpty() && current.size() == removed.size()) {
            throw bad("본문, 링크, 파일 중 하나는 입력해 주세요.");
        }

        LocalDateTime now = now();
        if (submission == null) {
            submission = new TeamProjectSubmission();
            submission.setProgramId(programId);
            submission.setTeamId(teamId);
            submission.setMilestoneId(milestoneId);
            submission.setSubmittedBy(actor.getStudentId());
            submission.setSubmittedByName(actor.getName());
            submission.setSubmittedAt(now);
        }
        submission.setBody(text);
        submission.setUpdatedBy(actor.getStudentId());
        submission.setUpdatedByName(actor.getName());
        submission.setUpdatedAt(now);
        try {
            submission = submissions.saveAndFlush(submission);
            links.deleteBySubmissionId(submission.getId());
            links.flush();
            for (int i = 0; i < urls.size(); i++) {
                TeamProjectSubmissionLink link = new TeamProjectSubmissionLink();
                link.setSubmissionId(submission.getId());
                link.setUrl(urls.get(i));
                link.setPosition(i);
                links.save(link);
            }
            files.deleteAll(removed);
            for (StoredUpload upload : incoming) {
                TeamProjectSubmissionFile row = new TeamProjectSubmissionFile();
                row.setSubmissionId(submission.getId());
                row.setOriginalName(upload.originalName());
                row.setMimeType(upload.mimeType());
                row.setFileSize(upload.size());
                row.setStoredName(upload.storedName());
                row.setUploadedBy(actor.getStudentId());
                row.setUploadedAt(now);
                files.save(row);
            }
            files.flush();
        } catch (DataIntegrityViolationException ex) {
            throw conflict("다른 팀원이 방금 제출했습니다. 새로고침한 뒤 다시 시도해 주세요.");
        }
        deleteAfterCommit(removed.stream().map(TeamProjectSubmissionFile::getStoredName).toList());
        return views(List.of(submission), Map.of(milestoneId, milestone), programId).get(0);
    }

    @Transactional
    public void deleteSubmission(Long programId, Long teamId, Long milestoneId, String viewer) {
        lockTeam(programId, teamId);
        TeamProject program = requireProgram(programId);
        TeamProjectMilestone milestone = requireMilestone(programId, milestoneId);
        requireMember(viewer);
        boolean admin = isAdmin(viewer);
        if (!admin && !teamMembers.existsByTeamIdAndStudentId(teamId, viewer)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        // 팀원은 마감된 프로그램·제출을 받지 않는 일정의 제출을 지울 수 없다(회장은 정리할 수 있다).
        if (!admin && !program.isOpen()) throw conflict("마감된 프로그램의 제출은 삭제할 수 없습니다.");
        if (!admin && !milestone.isSubmittable()) throw conflict("이 일정은 제출을 받지 않습니다.");
        TeamProjectSubmission submission = submissions.findByTeamIdAndMilestoneId(teamId, milestoneId)
                .orElseThrow(() -> notFound("제출을 찾을 수 없습니다."));
        List<String> stored = purge(List.of(submission));
        submissions.flush();
        deleteAfterCommit(stored);
    }

    @Transactional(readOnly = true)
    public ResponseEntity<Resource> download(Long programId, Long teamId, Long milestoneId, Long fileId, String viewer) {
        requireProgram(programId);
        requireTeam(programId, teamId);
        requireMilestone(programId, milestoneId);
        requireReader(teamId, viewer);
        TeamProjectSubmission submission = submissions.findByTeamIdAndMilestoneId(teamId, milestoneId)
                .orElseThrow(() -> notFound("제출을 찾을 수 없습니다."));
        TeamProjectSubmissionFile file = files.findByIdAndSubmissionId(fileId, submission.getId())
                .orElseThrow(() -> notFound("파일을 찾을 수 없습니다."));
        Resource resource = storage.load(file.getStoredName());
        // 업로드는 무엇이든 받지만 내려줄 때는 항상 첨부로 — 사용자 HTML/SVG 가 우리 출처에서 렌더링되면 안 된다.
        return ResponseEntity.ok()
                .contentType(SafeMediaTypes.forDownload(file.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(safeFilename(file.getOriginalName()), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(resource);
    }

    // ---- 내부 -----------------------------------------------------------------------------

    private List<TeamProjectSubmissionView> views(List<TeamProjectSubmission> rows, Map<Long, TeamProjectMilestone> milestoneById, Long programId) {
        if (rows.isEmpty()) return List.of();
        List<Long> ids = rows.stream().map(TeamProjectSubmission::getId).toList();
        Map<Long, List<String>> linkRows = links.findBySubmissionIdInOrderByPositionAscIdAsc(ids).stream()
                .collect(Collectors.groupingBy(TeamProjectSubmissionLink::getSubmissionId, Collectors.mapping(TeamProjectSubmissionLink::getUrl, Collectors.toList())));
        Map<Long, List<TeamProjectSubmissionFile>> fileRows = files.findBySubmissionIdInOrderByIdAsc(ids).stream()
                .collect(Collectors.groupingBy(TeamProjectSubmissionFile::getSubmissionId));
        return rows.stream().map(row -> {
            TeamProjectMilestone milestone = milestoneById.get(row.getMilestoneId());
            return new TeamProjectSubmissionView(row.getId(), row.getTeamId(), row.getMilestoneId(), row.getBody(),
                    linkRows.getOrDefault(row.getId(), List.of()),
                    fileRows.getOrDefault(row.getId(), List.of()).stream().map(file -> new TeamProjectFileView(file.getId(),
                            file.getOriginalName(), file.getMimeType(), file.getFileSize(),
                            "/api/team-projects/" + programId + "/teams/" + row.getTeamId() + "/milestones/" + row.getMilestoneId()
                                    + "/submission/files/" + file.getId())).toList(),
                    row.getSubmittedByName(), row.getSubmittedAt(), row.getUpdatedByName(), row.getUpdatedAt(),
                    isAfterDue(row.getSubmittedAt(), milestone), isAfterDue(row.getUpdatedAt(), milestone));
        }).toList();
    }

    private Map<Long, TeamProjectMilestone> milestoneMap(Long programId) {
        return milestones.findByProgramIdOrderByPositionAscIdAsc(programId).stream()
                .collect(Collectors.toMap(TeamProjectMilestone::getId, Function.identity()));
    }

    private static boolean isLate(TeamProjectSubmission submission, TeamProjectMilestone milestone) {
        return isAfterDue(submission.getSubmittedAt(), milestone);
    }

    private static boolean isAfterDue(LocalDateTime at, TeamProjectMilestone milestone) {
        LocalDateTime due = milestone == null ? null : milestone.effectiveDue();
        return due != null && at.isAfter(due);
    }

    private List<TeamProjectMemberView> memberViews(Collection<TeamProjectMember> rows, boolean admin) {
        Map<String, Member> people = members.findByStudentIdIn(rows.stream().map(TeamProjectMember::getStudentId).toList())
                .stream().collect(Collectors.toMap(Member::getStudentId, Function.identity()));
        return rows.stream().map(row -> {
            Member person = people.get(row.getStudentId());
            return new TeamProjectMemberView(admin ? row.getStudentId() : null,
                    person == null ? row.getStudentId() : person.getName(), person == null ? null : person.getGeneration());
        }).toList();
    }

    private static TeamProjectMilestoneView view(TeamProjectMilestone m) {
        return new TeamProjectMilestoneView(m.getId(), m.getTitle(), m.getDescription(), m.getStartsAt(), m.getDueAt(),
                m.isAllDay(), m.isSubmittable(), m.getPosition());
    }

    /** 제출과 그 링크·파일 행을 지우고, 커밋 뒤에 지울 저장 파일 이름을 돌려준다. 자식 행부터 지운다. */
    private List<String> purge(List<TeamProjectSubmission> rows) {
        if (rows.isEmpty()) return List.of();
        List<Long> ids = rows.stream().map(TeamProjectSubmission::getId).toList();
        List<TeamProjectSubmissionFile> fileRows = files.findBySubmissionIdInOrderByIdAsc(ids);
        List<String> stored = fileRows.stream().map(TeamProjectSubmissionFile::getStoredName).toList();
        files.deleteAll(fileRows);
        links.deleteBySubmissionIdIn(ids);
        submissions.deleteAll(rows);
        return stored;
    }

    private void deleteAfterCommit(List<String> storedNames) {
        if (storedNames.isEmpty()) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { storedNames.forEach(TeamProjectService.this::deleteQuietly); }
        });
    }

    private void deleteQuietly(String stored) {
        try {
            storage.delete(stored);
        } catch (RuntimeException ignored) {
            // 고아 파일은 남을 수 있지만 이미 끝난 트랜잭션의 응답을 실패로 바꾸지는 않는다.
        }
    }

    private boolean isAdmin(String viewer) {
        return members.findByStudentId(viewer).map(member -> member.getRole() == Member.Role.ADMIN).orElse(false);
    }

    private Member requireMember(String viewer) {
        return members.findByStudentId(viewer).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    /** 팀원과 회장만 그 팀의 제출물과 파일을 본다. */
    private void requireReader(Long teamId, String viewer) {
        Member member = requireMember(viewer);
        if (member.getRole() != Member.Role.ADMIN && !teamMembers.existsByTeamIdAndStudentId(teamId, viewer)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    private TeamProject requireProgram(Long id) {
        return programs.findById(id).orElseThrow(() -> notFound("팀 프로젝트를 찾을 수 없습니다."));
    }

    private static final String LOCK_BUSY = "다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.";

    /** 잠금 순서는 항상 프로그램 → 팀이다. 제출은 팀 잠금만 쓴다. 잠금 대기가 길어지면 500 대신 409 로 돌려보낸다. */
    private void lockProgram(Long id) {
        lockOrConflict(() -> programs.lockById(id)).orElseThrow(() -> notFound("팀 프로젝트를 찾을 수 없습니다."));
    }

    private void lockTeam(Long programId, Long teamId) {
        TeamProjectTeam team = lockOrConflict(() -> teams.lockById(teamId)).orElseThrow(() -> notFound("팀을 찾을 수 없습니다."));
        if (!team.getProgramId().equals(programId)) throw notFound("팀을 찾을 수 없습니다.");
    }

    private void lockAllTeams(Long programId) {
        lockOrConflict(() -> teams.lockByProgramId(programId));
    }

    private <T> T lockOrConflict(java.util.function.Supplier<T> lock) {
        try {
            return lock.get();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            if (isLockTimeout(ex)) throw conflict(LOCK_BUSY);
            throw ex;
        }
    }

    private static boolean isLockTimeout(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.springframework.dao.PessimisticLockingFailureException
                    || cause instanceof org.springframework.dao.QueryTimeoutException
                    || cause instanceof jakarta.persistence.LockTimeoutException
                    || cause instanceof jakarta.persistence.PessimisticLockException
                    || cause instanceof java.sql.SQLTimeoutException) {
                return true;
            }
            if (cause instanceof java.sql.SQLException sql && sql.getSQLState() != null
                    && java.util.Set.of("50200", "55P03", "57014").contains(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }

    private TeamProjectTeam requireTeam(Long programId, Long teamId) {
        return teams.findByProgramIdAndId(programId, teamId).orElseThrow(() -> notFound("팀을 찾을 수 없습니다."));
    }

    private TeamProjectMilestone requireMilestone(Long programId, Long milestoneId) {
        return milestones.findByProgramIdAndId(programId, milestoneId).orElseThrow(() -> notFound("일정을 찾을 수 없습니다."));
    }

    private static List<String> normalizeLinks(List<String> inputs) {
        Set<String> cleaned = new LinkedHashSet<>();
        for (String input : inputs == null ? List.<String>of() : inputs) {
            String url = input == null ? "" : input.strip();
            if (url.isEmpty()) continue;
            if (url.length() > MAX_LINK) throw bad("링크는 " + MAX_LINK + "자까지 입력할 수 있습니다.");
            try {
                URI uri = new URI(url);
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
                if (!(scheme.equals("http") || scheme.equals("https")) || uri.getHost() == null) throw new IllegalArgumentException();
            } catch (java.net.URISyntaxException | IllegalArgumentException ex) {
                throw bad("링크는 http:// 또는 https:// 로 시작하는 주소여야 합니다: " + (url.length() > 60 ? url.substring(0, 60) + "…" : url));
            }
            cleaned.add(url);
        }
        return new ArrayList<>(cleaned);
    }

    /** 표시·다운로드용 파일명: 경로·제어문자·방향 제어 문자를 지우고 길이를 줄인다. 저장 경로에는 쓰이지 않는다. */
    static String safeFilename(String raw) {
        String name = raw == null ? "" : raw.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1)
                .replaceAll("[\\p{Cntrl}\\p{Cf}]", "")
                .replaceAll("[\"<>:*?|]", "_")
                .strip();
        if (name.codePointCount(0, name.length()) > 200) {
            name = name.substring(0, name.offsetByCodePoints(0, 200));
        }
        return name.isEmpty() || name.equals(".") || name.equals("..") ? "file" : name;
    }

    private static String storedMime(String contentType) {
        var safe = SafeMediaTypes.forDownload(contentType);
        String base = safe.getType() + "/" + safe.getSubtype();
        return base.length() <= 100 ? base : "application/octet-stream";
    }

    private static String required(String value, int max, String label) {
        String text = value == null ? "" : value.strip();
        if (text.isEmpty()) throw bad(label + "을(를) 입력해 주세요.");
        if (text.length() > max) throw bad(label + "은(는) " + max + "자까지 입력할 수 있습니다.");
        return text;
    }

    private static String optional(String value, int max, String label) {
        String text = value == null ? "" : value.strip();
        if (text.length() > max) throw bad(label + "은(는) " + max + "자까지 입력할 수 있습니다.");
        return text;
    }

    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private static ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }
}
