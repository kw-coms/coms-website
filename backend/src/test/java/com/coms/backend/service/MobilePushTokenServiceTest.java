package com.coms.backend.service;

import com.coms.backend.domain.MobilePushToken;
import com.coms.backend.dto.PushTokenRequest;
import com.coms.backend.repository.MobilePushTokenRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MobilePushTokenServiceTest {

    @Test
    void registersANewTokenWithNormalizedDeviceMetadata() {
        MobilePushTokenRepository repository = mock(MobilePushTokenRepository.class);
        when(repository.findByToken("push-token")).thenReturn(Optional.empty());
        when(repository.save(any(MobilePushToken.class))).thenAnswer(invocation -> invocation.getArgument(0));
        MobilePushTokenService service = new MobilePushTokenService(repository);

        service.register("2026123456", new PushTokenRequest("push-token", "  android  ", "  device-1  "));

        var saved = captureSavedToken(repository);
        assertThat(saved.getMemberStudentId()).isEqualTo("2026123456");
        assertThat(saved.getToken()).isEqualTo("push-token");
        assertThat(saved.getPlatform()).isEqualTo("android");
        assertThat(saved.getDeviceId()).isEqualTo("device-1");
        assertThat(saved.isEnabled()).isTrue();
    }

    @Test
    void reassignsAnExistingTokenToTheCurrentMember() {
        MobilePushTokenRepository repository = mock(MobilePushTokenRepository.class);
        MobilePushToken existing = new MobilePushToken();
        existing.setMemberStudentId("2025000000");
        existing.setToken("push-token");
        existing.setEnabled(false);
        when(repository.findByToken("push-token")).thenReturn(Optional.of(existing));
        MobilePushTokenService service = new MobilePushTokenService(repository);

        service.register("2026123456", new PushTokenRequest("push-token", null, null));

        assertThat(existing.getMemberStudentId()).isEqualTo("2026123456");
        assertThat(existing.isEnabled()).isTrue();
        verify(repository).save(existing);
    }

    private MobilePushToken captureSavedToken(MobilePushTokenRepository repository) {
        var captor = org.mockito.ArgumentCaptor.forClass(MobilePushToken.class);
        verify(repository).save(captor.capture());
        return captor.getValue();
    }
}
