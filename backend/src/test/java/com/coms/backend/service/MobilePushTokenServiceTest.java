package com.coms.backend.service;

import com.coms.backend.domain.MobilePushToken;
import com.coms.backend.dto.PushTokenRequest;
import com.coms.backend.repository.MobilePushTokenRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
    void reRegistersAnExistingTokenForItsCurrentOwner() {
        MobilePushTokenRepository repository = mock(MobilePushTokenRepository.class);
        MobilePushToken existing = new MobilePushToken();
        existing.setMemberStudentId("2026123456");
        existing.setToken("push-token");
        existing.setEnabled(false);
        when(repository.findByToken("push-token")).thenReturn(Optional.of(existing));
        MobilePushTokenService service = new MobilePushTokenService(repository);

        service.register("2026123456", new PushTokenRequest("push-token", null, null));

        assertThat(existing.getMemberStudentId()).isEqualTo("2026123456");
        assertThat(existing.isEnabled()).isTrue();
        verify(repository).save(existing);
    }

    @Test
    void rejectsRebindingATokenOwnedByAnotherMember() {
        MobilePushTokenRepository repository = mock(MobilePushTokenRepository.class);
        MobilePushToken existing = new MobilePushToken();
        existing.setMemberStudentId("2025000000");
        existing.setToken("push-token");
        existing.setEnabled(true);
        when(repository.findByToken("push-token")).thenReturn(Optional.of(existing));
        MobilePushTokenService service = new MobilePushTokenService(repository);

        assertThatThrownBy(() ->
                service.register("2026123456", new PushTokenRequest("push-token", null, null)))
                .isInstanceOf(ResponseStatusException.class);

        // The other member's token must be left untouched and never persisted under the caller.
        assertThat(existing.getMemberStudentId()).isEqualTo("2025000000");
        verify(repository, never()).save(any(MobilePushToken.class));
    }

    @Test
    void unregisterDeletesTheCallersOwnToken() {
        MobilePushTokenRepository repository = mock(MobilePushTokenRepository.class);
        MobilePushToken owned = new MobilePushToken();
        owned.setMemberStudentId("2026123456");
        owned.setToken("push-token");
        when(repository.findByToken("push-token")).thenReturn(Optional.of(owned));
        MobilePushTokenService service = new MobilePushTokenService(repository);

        service.unregister("2026123456", "  push-token  ");

        verify(repository).delete(owned);
    }

    @Test
    void unregisterNeverDeletesAnotherMembersToken() {
        MobilePushTokenRepository repository = mock(MobilePushTokenRepository.class);
        MobilePushToken someoneElses = new MobilePushToken();
        someoneElses.setMemberStudentId("2025000000");
        someoneElses.setToken("push-token");
        when(repository.findByToken("push-token")).thenReturn(Optional.of(someoneElses));
        MobilePushTokenService service = new MobilePushTokenService(repository);

        service.unregister("2026123456", "push-token");

        verify(repository, never()).delete(any(MobilePushToken.class));
    }

    @Test
    void unregisterIsIdempotentForAnUnknownToken() {
        MobilePushTokenRepository repository = mock(MobilePushTokenRepository.class);
        when(repository.findByToken("gone")).thenReturn(Optional.empty());
        MobilePushTokenService service = new MobilePushTokenService(repository);

        service.unregister("2026123456", "gone");
        service.unregister("2026123456", "  ");

        verify(repository, never()).delete(any(MobilePushToken.class));
    }

    private MobilePushToken captureSavedToken(MobilePushTokenRepository repository) {
        var captor = org.mockito.ArgumentCaptor.forClass(MobilePushToken.class);
        verify(repository).save(captor.capture());
        return captor.getValue();
    }
}
