package com.coms.backend.dto;

import java.util.List;

/**
 * Aggregate counts for the admin analytics dashboard. All values are produced by
 * COUNT / GROUP BY queries; no full tables are loaded into memory.
 */
public record AdminAnalyticsResponse(
        long totalMembers,
        List<StatusCount> membersByRole,
        long totalNotices,
        long totalCommunityPosts,
        long totalCommunityComments,
        long totalClubActivities,
        long totalClubEvents,
        long totalArchiveFiles,
        List<StatusCount> recruitApplicationsByStatus,
        long communityReportsOpen,
        long communityReportsResolved,
        List<MonthlyCount> recruitApplicationsByMonth
) {
    public record StatusCount(String key, long count) {
    }

    public record MonthlyCount(String month, long count) {
    }
}
