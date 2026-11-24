package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notification;
import com.coms.backend.domain.NotificationPreference;
import com.coms.backend.dto.MemberExternalInviteRequest;
import com.coms.backend.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationInviteBatchQueryTest {
    @Mock NotificationRepository notifications;
    @Mock NotificationPreferenceRepository preferences;
    @Mock MemberRepository members;
    @Mock EligibleMemberRepository eligibleMembers;
    @Mock EmailVerificationSender mail;
    @Mock PushNotificationSender push;
    @Mock PermissionService permissions;

    @Test
    void membershipAndPreferencesAreLoadedOncePerBatch() {
        NotificationService service = new NotificationService(notifications, preferences, members, eligibleMembers,
                mail, push, "example.test", Runnable::run, permissions,
                Clock.fixed(Instant.parse("2026-11-30T15:30:00Z"), ZoneId.of("Asia/Seoul")));
        Member sender = new Member();
        sender.setStudentId("sender");
        sender.setName("Sender");
        Member recipient = new Member();
        recipient.setStudentId("member");
        Member optedOut = new Member();
        optedOut.setStudentId("disabled");
        EligibleMember eligible = new EligibleMember();
        eligible.setStudentId("eligible");
        NotificationPreference disabled = new NotificationPreference("disabled");
        disabled.setExternalInvite(false);
        when(members.findByStudentId("sender")).thenReturn(Optional.of(sender));
        when(members.findByStudentIdIn(anyCollection())).thenReturn(List.of(recipient, optedOut));
        when(eligibleMembers.findByStudentIdIn(anyCollection())).thenReturn(List.of(eligible));
        when(preferences.findByMemberStudentIdIn(anyCollection())).thenReturn(List.of(disabled));
        when(notifications.save(any(Notification.class))).thenAnswer(invocation -> invocation.getArgument(0));
        MemberExternalInviteRequest request = new MemberExternalInviteRequest();
        request.setRecipientStudentIds(List.of("member", "eligible", "missing", "member", "disabled"));
        request.setMessage("Invite");

        var result = service.notifyExternalInviteFromMember("sender", request);

        assertThat(result.accepted()).isEqualTo(2);
        verify(members, times(1)).findByStudentId("sender");
        verify(members, times(1)).findByStudentIdIn(anyCollection());
        verify(eligibleMembers, times(1)).findByStudentIdIn(anyCollection());
        verify(preferences, times(1)).findByMemberStudentIdIn(anyCollection());
        verify(members, never()).existsByStudentId(anyString());
        verify(eligibleMembers, never()).findByStudentId(anyString());
        verify(preferences, never()).findByMemberStudentId(anyString());
        var saved = org.mockito.ArgumentCaptor.forClass(Notification.class);
        verify(notifications, times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).allSatisfy(notification ->
                assertThat(notification.getCreatedAt()).isEqualTo(LocalDateTime.of(2026, 12, 1, 0, 30)));
    }
}
