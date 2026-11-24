package com.coms.backend.controller;

import com.coms.backend.dto.MemberExternalInviteRequest;
import com.coms.backend.service.NotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class NotificationControllerInvitePrivacyTest {
    @Test
    void memberInviteResponseIsIdenticalForKnownAndUnknownRecipients() {
        NotificationService service = mock(NotificationService.class);
        var knownRequest = new MemberExternalInviteRequest();
        knownRequest.setRecipientStudentIds(List.of("existing"));
        var unknownRequest = new MemberExternalInviteRequest();
        unknownRequest.setRecipientStudentIds(List.of("missing"));
        when(service.notifyExternalInviteFromMember("sender", knownRequest))
                .thenReturn(new NotificationService.ExternalInviteBatchResult(1, 0));
        when(service.notifyExternalInviteFromMember("sender", unknownRequest))
                .thenReturn(new NotificationService.ExternalInviteBatchResult(0, 1));

        var controller = new NotificationController(service);
        var authentication = new UsernamePasswordAuthenticationToken("sender", null);
        var knownResponse = controller.sendExternalInvite(authentication, "XMLHttpRequest", knownRequest);
        var unknownResponse = controller.sendExternalInvite(authentication, "XMLHttpRequest", unknownRequest);

        assertThat(knownResponse.getStatusCode()).isEqualTo(unknownResponse.getStatusCode());
        assertThat(knownResponse.getBody()).isEqualTo(Map.of("accepted", true));
        assertThat(unknownResponse.getBody()).isEqualTo(knownResponse.getBody());
        verify(service).notifyExternalInviteFromMember("sender", knownRequest);
        verify(service).notifyExternalInviteFromMember("sender", unknownRequest);
    }
}
