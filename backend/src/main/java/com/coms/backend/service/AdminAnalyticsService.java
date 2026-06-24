package com.coms.backend.service;

import com.coms.backend.domain.CommunityPostReport;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.RecruitApplication;
import com.coms.backend.dto.AdminAnalyticsResponse;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.ClubActivityRepository;
import com.coms.backend.repository.ClubEventRepository;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostReportRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NoticeRepository;
import com.coms.backend.repository.RecruitApplicationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the admin analytics aggregate using COUNT / GROUP BY style queries only.
 *
 * <p>The recruit-applications monthly time series is derived in Java from a lightweight
 * projection (only the {@code submittedAt} timestamps from the last 6 months) rather than a
 * database {@code date_trunc}. This avoids H2/PostgreSQL portability differences while still
 * reading a single, bounded column instead of full rows.
 */
@Service
@Transactional(readOnly = true)
public class AdminAnalyticsService {

    private static final int TIME_SERIES_MONTHS = 6;
    private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");

    private final MemberRepository memberRepository;
    private final NoticeRepository noticeRepository;
    private final CommunityPostRepository communityPostRepository;
    private final CommunityCommentRepository communityCommentRepository;
    private final CommunityPostReportRepository communityPostReportRepository;
    private final RecruitApplicationRepository recruitApplicationRepository;
    private final ClubActivityRepository clubActivityRepository;
    private final ClubEventRepository clubEventRepository;
    private final ArchiveFileRepository archiveFileRepository;

    public AdminAnalyticsService(MemberRepository memberRepository,
                                 NoticeRepository noticeRepository,
                                 CommunityPostRepository communityPostRepository,
                                 CommunityCommentRepository communityCommentRepository,
                                 CommunityPostReportRepository communityPostReportRepository,
                                 RecruitApplicationRepository recruitApplicationRepository,
                                 ClubActivityRepository clubActivityRepository,
                                 ClubEventRepository clubEventRepository,
                                 ArchiveFileRepository archiveFileRepository) {
        this.memberRepository = memberRepository;
        this.noticeRepository = noticeRepository;
        this.communityPostRepository = communityPostRepository;
        this.communityCommentRepository = communityCommentRepository;
        this.communityPostReportRepository = communityPostReportRepository;
        this.recruitApplicationRepository = recruitApplicationRepository;
        this.clubActivityRepository = clubActivityRepository;
        this.clubEventRepository = clubEventRepository;
        this.archiveFileRepository = archiveFileRepository;
    }

    public AdminAnalyticsResponse buildAnalytics() {
        List<AdminAnalyticsResponse.StatusCount> membersByRole = new ArrayList<>();
        for (Member.Role role : Member.Role.values()) {
            membersByRole.add(new AdminAnalyticsResponse.StatusCount(role.name(), memberRepository.countByRole(role)));
        }

        List<AdminAnalyticsResponse.StatusCount> recruitByStatus = new ArrayList<>();
        for (RecruitApplication.Status status : RecruitApplication.Status.values()) {
            recruitByStatus.add(new AdminAnalyticsResponse.StatusCount(status.name(),
                    recruitApplicationRepository.countByStatus(status)));
        }

        long reportsOpen = communityPostReportRepository.countByStatus(CommunityPostReport.Status.OPEN);
        long reportsResolved = communityPostReportRepository.countByStatus(CommunityPostReport.Status.ACCEPTED)
                + communityPostReportRepository.countByStatus(CommunityPostReport.Status.REJECTED);

        return new AdminAnalyticsResponse(
                memberRepository.count(),
                membersByRole,
                noticeRepository.count(),
                communityPostRepository.count(),
                communityCommentRepository.count(),
                clubActivityRepository.count(),
                clubEventRepository.count(),
                archiveFileRepository.count(),
                recruitByStatus,
                reportsOpen,
                reportsResolved,
                recruitApplicationsByMonth()
        );
    }

    private List<AdminAnalyticsResponse.MonthlyCount> recruitApplicationsByMonth() {
        YearMonth currentMonth = YearMonth.from(LocalDate.now());
        YearMonth firstMonth = currentMonth.minusMonths(TIME_SERIES_MONTHS - 1L);
        LocalDateTime since = firstMonth.atDay(1).atStartOfDay();

        // Pre-seed every bucket so months with zero applications still render in the series.
        Map<String, Long> buckets = new LinkedHashMap<>();
        for (int i = 0; i < TIME_SERIES_MONTHS; i++) {
            buckets.put(firstMonth.plusMonths(i).format(MONTH_FORMAT), 0L);
        }

        for (LocalDateTime submittedAt : recruitApplicationRepository.findSubmittedAtSince(since)) {
            if (submittedAt == null) {
                continue;
            }
            String key = YearMonth.from(submittedAt).format(MONTH_FORMAT);
            buckets.computeIfPresent(key, (k, v) -> v + 1);
        }

        List<AdminAnalyticsResponse.MonthlyCount> series = new ArrayList<>();
        buckets.forEach((month, count) -> series.add(new AdminAnalyticsResponse.MonthlyCount(month, count)));
        return series;
    }
}
