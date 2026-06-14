package com.coms.backend.dto;

import java.util.List;

public record MobileHomeResponse(
        List<NoticeResponse> latestNotices,
        List<CommunityPostResponse> recentPosts,
        List<ArchiveFileResponse> quickFiles,
        NotificationSummaryResponse notificationSummary,
        List<NotificationResponse> notifications
) {}
