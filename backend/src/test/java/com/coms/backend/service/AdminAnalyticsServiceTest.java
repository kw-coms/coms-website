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
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminAnalyticsServiceTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final NoticeRepository noticeRepository = mock(NoticeRepository.class);
    private final CommunityPostRepository communityPostRepository = mock(CommunityPostRepository.class);
    private final CommunityCommentRepository communityCommentRepository = mock(CommunityCommentRepository.class);
    private final CommunityPostReportRepository communityPostReportRepository = mock(CommunityPostReportRepository.class);
    private final RecruitApplicationRepository recruitApplicationRepository = mock(RecruitApplicationRepository.class);
    private final ClubActivityRepository clubActivityRepository = mock(ClubActivityRepository.class);
    private final ClubEventRepository clubEventRepository = mock(ClubEventRepository.class);
    private final ArchiveFileRepository archiveFileRepository = mock(ArchiveFileRepository.class);

    private final AdminAnalyticsService service = new AdminAnalyticsService(
            memberRepository, noticeRepository, communityPostRepository, communityCommentRepository,
            communityPostReportRepository, recruitApplicationRepository, clubActivityRepository,
            clubEventRepository, archiveFileRepository);

    @Test
    void buildAnalyticsReturnsTotalsAndGroupedCounts() {
        when(memberRepository.count()).thenReturn(42L);
        when(memberRepository.countByRole(Member.Role.USER)).thenReturn(40L);
        when(memberRepository.countByRole(Member.Role.ADMIN)).thenReturn(2L);
        when(noticeRepository.count()).thenReturn(7L);
        when(communityPostRepository.count()).thenReturn(120L);
        when(communityCommentRepository.count()).thenReturn(350L);
        when(clubActivityRepository.count()).thenReturn(18L);
        when(clubEventRepository.count()).thenReturn(5L);
        when(archiveFileRepository.count()).thenReturn(64L);

        when(recruitApplicationRepository.countByStatus(RecruitApplication.Status.RECEIVED)).thenReturn(10L);
        when(recruitApplicationRepository.countByStatus(RecruitApplication.Status.REVIEWING)).thenReturn(4L);
        when(recruitApplicationRepository.countByStatus(RecruitApplication.Status.ACCEPTED)).thenReturn(8L);
        when(recruitApplicationRepository.countByStatus(RecruitApplication.Status.HOLD)).thenReturn(2L);
        when(recruitApplicationRepository.countByStatus(RecruitApplication.Status.REJECTED)).thenReturn(6L);

        when(communityPostReportRepository.countByStatus(CommunityPostReport.Status.OPEN)).thenReturn(3L);
        when(communityPostReportRepository.countByStatus(CommunityPostReport.Status.ACCEPTED)).thenReturn(5L);
        when(communityPostReportRepository.countByStatus(CommunityPostReport.Status.REJECTED)).thenReturn(9L);

        when(recruitApplicationRepository.findSubmittedAtSince(any())).thenReturn(List.of());

        AdminAnalyticsResponse response = service.buildAnalytics();

        assertThat(response.totalMembers()).isEqualTo(42L);
        assertThat(response.totalNotices()).isEqualTo(7L);
        assertThat(response.totalCommunityPosts()).isEqualTo(120L);
        assertThat(response.totalCommunityComments()).isEqualTo(350L);
        assertThat(response.totalClubActivities()).isEqualTo(18L);
        assertThat(response.totalClubEvents()).isEqualTo(5L);
        assertThat(response.totalArchiveFiles()).isEqualTo(64L);

        assertThat(response.membersByRole())
                .extracting(AdminAnalyticsResponse.StatusCount::key, AdminAnalyticsResponse.StatusCount::count)
                .contains(org.assertj.core.groups.Tuple.tuple("USER", 40L),
                        org.assertj.core.groups.Tuple.tuple("ADMIN", 2L));

        assertThat(response.recruitApplicationsByStatus())
                .extracting(AdminAnalyticsResponse.StatusCount::key, AdminAnalyticsResponse.StatusCount::count)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("RECEIVED", 10L),
                        org.assertj.core.groups.Tuple.tuple("REVIEWING", 4L),
                        org.assertj.core.groups.Tuple.tuple("ACCEPTED", 8L),
                        org.assertj.core.groups.Tuple.tuple("HOLD", 2L),
                        org.assertj.core.groups.Tuple.tuple("REJECTED", 6L));

        // resolved = ACCEPTED + REJECTED
        assertThat(response.communityReportsOpen()).isEqualTo(3L);
        assertThat(response.communityReportsResolved()).isEqualTo(14L);
    }

    @Test
    void recruitApplicationsByMonthBucketsTimestampsIntoSixMonths() {
        DateTimeFormatter monthFormat = DateTimeFormatter.ofPattern("yyyy-MM");
        YearMonth currentMonth = YearMonth.now();
        String currentKey = currentMonth.format(monthFormat);
        String previousKey = currentMonth.minusMonths(1).format(monthFormat);

        when(recruitApplicationRepository.findSubmittedAtSince(any())).thenReturn(List.of(
                currentMonth.atDay(2).atTime(9, 0),
                currentMonth.atDay(15).atTime(18, 30),
                currentMonth.minusMonths(1).atDay(10).atTime(12, 0)
        ));

        AdminAnalyticsResponse response = service.buildAnalytics();

        List<AdminAnalyticsResponse.MonthlyCount> series = response.recruitApplicationsByMonth();
        assertThat(series).hasSize(6);
        assertThat(series.get(series.size() - 1).month()).isEqualTo(currentKey);

        assertThat(series.stream().filter(m -> m.month().equals(currentKey)).findFirst())
                .get()
                .extracting(AdminAnalyticsResponse.MonthlyCount::count)
                .isEqualTo(2L);
        assertThat(series.stream().filter(m -> m.month().equals(previousKey)).findFirst())
                .get()
                .extracting(AdminAnalyticsResponse.MonthlyCount::count)
                .isEqualTo(1L);
    }
}
