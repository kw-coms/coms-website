package com.coms.backend.dto;

import com.coms.backend.domain.NotificationPreference;

public record NotificationPreferencesResponse(
        boolean commentOnPost,
        boolean replyOnComment,
        boolean noticeCreated,
        boolean externalInvite,
        boolean communityPostRestored,
        boolean communityPostDeleted,
        boolean recruitApplication
) {
    public static NotificationPreferencesResponse from(NotificationPreference preference) {
        return new NotificationPreferencesResponse(
                preference.isCommentOnPost(),
                preference.isReplyOnComment(),
                preference.isNoticeCreated(),
                preference.isExternalInvite(),
                preference.isCommunityPostRestored(),
                preference.isCommunityPostDeleted(),
                preference.isRecruitApplication()
        );
    }
}
