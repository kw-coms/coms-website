package com.coms.backend.service;

import com.coms.backend.domain.CommunityPostReport;
import com.coms.backend.dto.CommunityPostReportRequest;
import com.coms.backend.dto.CommunityPostReportResponse;
import com.coms.backend.repository.CommunityPostReportRepository;
import com.coms.backend.repository.CommunityPostRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

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

    public CommunityPostReportService(CommunityPostReportRepository reportRepository,
                                      CommunityPostRepository postRepository) {
        this.reportRepository = reportRepository;
        this.postRepository = postRepository;
    }

    public CommunityPostReportResponse report(Long postId, String reporterStudentId, CommunityPostReportRequest request) {
        if (!postRepository.existsById(postId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "신고할 글을 찾을 수 없습니다.");
        }
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
        report.setReporterStudentId(reporterStudentId);
        report.setReason(reason);
        report.setDetail(request.detail());
        report.setCreatedAt(LocalDateTime.now());
        return CommunityPostReportResponse.from(reportRepository.save(report));
    }

    @Transactional(readOnly = true)
    public List<CommunityPostReportResponse> listOpen() {
        return reportRepository.findByStatusOrderByCreatedAtDesc(CommunityPostReport.Status.OPEN)
                .stream()
                .map(CommunityPostReportResponse::from)
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
        report.setStatus(nextStatus);
        report.setResolvedByStudentId(resolverStudentId);
        report.setResolutionNote(note);
        report.setResolvedAt(LocalDateTime.now());
        return CommunityPostReportResponse.from(reportRepository.save(report));
    }
}
