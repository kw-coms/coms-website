package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostReport;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityPostReportRequest;
import com.coms.backend.dto.CommunityPostReportResponse;
import com.coms.backend.repository.CommunityPostReportRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional
public class CommunityPostReportService {

    private static final Set<String> ALLOWED_REASONS = Set.of(
            "SPAM",
            "ABUSE",
            "PRIVACY",
            "PROFANITY",
            "MISLEADING",
            "OTHER"
    );

    private final CommunityPostReportRepository reportRepository;
    private final CommunityPostRepository postRepository;
    private final AuditLogService auditLogService;
    private final MemberRepository memberRepository;

    public CommunityPostReportService(CommunityPostReportRepository reportRepository,
                                      CommunityPostRepository postRepository,
                                      AuditLogService auditLogService,
                                      MemberRepository memberRepository) {
        this.reportRepository = reportRepository;
        this.postRepository = postRepository;
        this.auditLogService = auditLogService;
        this.memberRepository = memberRepository;
    }

    public CommunityPostReportResponse report(Long postId, String reporterStudentId, CommunityPostReportRequest request) {
        CommunityPost post = postRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "신고할 글을 찾을 수 없습니다."));
        String reason = request.reason() == null ? "" : request.reason().trim().toUpperCase();
        if (!ALLOWED_REASONS.contains(reason)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하지 않는 신고 사유입니다.");
        }
        reportRepository.findByPostIdAndReporterStudentIdAndStatus(postId, reporterStudentId, CommunityPostReport.Status.OPEN)
                .ifPresent((existing) -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 신고가 접수되어 처리 대기 중입니다.");
                });

        CommunityPostReport report = new CommunityPostReport();
        report.setPostId(postId);
        report.setPostTitle(post.getTitle());
        report.setPostAuthorStudentId(post.getAuthorStudentId());
        report.setPostAuthorName(post.getAuthorName());
        report.setReporterStudentId(reporterStudentId);
        report.setReason(reason);
        report.setDetail(request.detail());
        report.setCreatedAt(LocalDateTime.now());
        return CommunityPostReportResponse.from(reportRepository.save(report));
    }

    @Transactional(readOnly = true)
    public List<CommunityPostReportResponse> listOpen() {
        List<CommunityPostReport> reports = reportRepository.findByStatusOrderByCreatedAtDesc(CommunityPostReport.Status.OPEN);
        Map<Long, CommunityPost> postsById = postRepository.findAllById(reports.stream()
                        .map(CommunityPostReport::getPostId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(CommunityPost::getId, Function.identity()));
        return reports.stream()
                .map(report -> {
                    CommunityPost post = report.getPostId() == null ? null : postsById.get(report.getPostId());
                    return CommunityPostReportResponse.from(
                            report,
                            post == null ? null : report.getPostId(),
                            post == null ? null : post.getTitle());
                })
                .toList();
    }

    public CommunityPostReportResponse resolve(Long id, String resolverStudentId, String action, String note) {
        CommunityPostReport report = reportRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (report.getStatus() != CommunityPostReport.Status.OPEN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 처리된 신고입니다.");
        }
        CommunityPostReport.Status nextStatus;
        if ("ACCEPT".equalsIgnoreCase(action)) {
            nextStatus = CommunityPostReport.Status.ACCEPTED;
        } else if ("REJECT".equalsIgnoreCase(action)) {
            nextStatus = CommunityPostReport.Status.REJECTED;
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "처리 결과는 ACCEPT 또는 REJECT 입니다.");
        }
        String normalizedNote = normalizeAuditText(note, 500, "처리 메모");
        report.setStatus(nextStatus);
        report.setResolvedByStudentId(resolverStudentId);
        report.setResolutionNote(normalizedNote);
        report.setResolvedAt(LocalDateTime.now());
        CommunityPostReport saved = reportRepository.save(report);
        auditLogService.record(
                resolverStudentId,
                nextStatus == CommunityPostReport.Status.ACCEPTED ? "COMMUNITY_REPORT_ACCEPT" : "COMMUNITY_REPORT_REJECT",
                "COMMUNITY_POST_REPORT",
                String.valueOf(saved.getId()),
                reportAuditDetail(saved, resolverStudentId, normalizedNote),
                null
        );
        return CommunityPostReportResponse.from(saved, livePostTitle(saved));
    }

    private String livePostTitle(CommunityPostReport report) {
        if (report.getPostId() == null) {
            return null;
        }
        return postRepository.findById(report.getPostId()).map(CommunityPost::getTitle).orElse(null);
    }

    private String reportAuditDetail(CommunityPostReport report, String resolverStudentId, String note) {
        String resolverName = memberRepository.findByStudentId(resolverStudentId)
                .map(Member::getName)
                .orElse(null);
        List<String> lines = new ArrayList<>();
        if (report.getPostId() != null) {
            lines.add("postId=" + report.getPostId());
        }
        if (report.getPostTitle() != null && !report.getPostTitle().isBlank()) {
            lines.add("title=" + normalizeAuditText(report.getPostTitle(), 120, "게시글 제목"));
        }
        lines.add("author=" + auditIdentity(report.getPostAuthorName(), report.getPostAuthorStudentId()));
        lines.add("reporter=" + normalizeAuditText(report.getReporterStudentId(), 64, "신고자"));
        lines.add("resolvedBy=" + auditIdentity(resolverName, resolverStudentId));
        lines.add("reason=" + normalizeAuditText(report.getReason(), 64, "신고 사유"));
        if (note != null) {
            lines.add("note=" + note);
        }
        return String.join("\n", lines);
    }

    private String auditIdentity(String name, String studentId) {
        return auditValue(name, 100, "이름") + "(" + auditValue(studentId, 64, "학번") + ")";
    }

    private String auditValue(String value, int maxLength, String label) {
        String normalized = normalizeAuditText(value, maxLength, label);
        return normalized == null ? "-" : normalized;
    }

    private String normalizeAuditText(String value, int maxLength, String label) {
        String normalized = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (normalized.isEmpty()) {
            return null;
        }
        if (normalized.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + "은(는) " + maxLength + "자 이하로 입력해주세요.");
        }
        return normalized;
    }
}
