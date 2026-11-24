package com.coms.backend.controller;

import com.coms.backend.dto.MemberExternalInviteRequest;
import com.coms.backend.service.NotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.lang.reflect.RecordComponent;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class NotificationControllerInvitePrivacyTest {
    @Test
    void memberInviteResponseContainsCountsOnly() {
        NotificationService service = mock(NotificationService.class);
        var request = new MemberExternalInviteRequest();
        request.setRecipientStudentIds(List.of("existing", "missing"));
        var result = new NotificationService.ExternalInviteBatchResult(1, 1);
        when(service.notifyExternalInviteFromMember("sender", request)).thenReturn(result);

        var body = new NotificationController(service).sendExternalInvite(
                new UsernamePasswordAuthenticationToken("sender", null), "XMLHttpRequest", request).getBody();

        assertThat(body).isEqualTo(result);
        assertThat(body.getClass().getRecordComponents()).extracting(RecordComponent::getName)
                .containsExactly("accepted", "undelivered");
        assertThat(body.toString()).doesNotContain("existing", "missing");
    }
}
