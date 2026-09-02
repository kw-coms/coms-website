package com.coms.backend.service;

import com.coms.backend.domain.MobilePushToken;
import com.coms.backend.repository.MobilePushTokenRepository;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.SendResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * FCM 무효 토큰 정리 경로 검증. sendToMember 가 readOnly 트랜잭션이라 예전에는 삭제가
 * flush 되지 않고 조용히 사라졌다 — 실제로 행이 지워지는지를 DB 로 확인한다.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:push-token-pruning-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class PushTokenPruningTest {

    @Autowired
    private MobilePushTokenRepository repository;

    @Autowired
    private PushTokenPruner pruner;

    @Autowired
    private PushNotificationSender sender;

    @BeforeEach
    void setUp() {
        repository.deleteAll();
    }

    @Test
    void unregisteredTokensReportedByFcmAreActuallyDeleted() {
        MobilePushToken good = save("2026123456", "good-token");
        MobilePushToken stale = save("2026123456", "stale-token");
        MobilePushToken malformed = save("2026123456", "malformed-token");

        List<MobilePushToken> tokens = List.of(good, stale, malformed);
        List<String> registrationTokens = List.of("good-token", "stale-token", "malformed-token");
        BatchResponse response = batchResponse(
                success(),
                failure(MessagingErrorCode.UNREGISTERED),
                failure(MessagingErrorCode.INVALID_ARGUMENT));

        sender.pruneInvalidTokens(tokens, registrationTokens, response);

        assertThat(repository.findAll())
                .extracting(MobilePushToken::getToken)
                .containsExactly("good-token");
        assertThat(repository.findById(stale.getId())).isEmpty();
        assertThat(repository.findById(malformed.getId())).isEmpty();
    }

    @Test
    void transientFailuresDoNotDeleteTheToken() {
        MobilePushToken token = save("2026123456", "throttled-token");

        sender.pruneInvalidTokens(List.of(token), List.of("throttled-token"),
                batchResponse(failure(MessagingErrorCode.QUOTA_EXCEEDED)));

        assertThat(repository.findById(token.getId())).isPresent();
    }

    @Test
    void prunerCommitsInItsOwnTransaction() {
        MobilePushToken first = save("2026123456", "a");
        MobilePushToken second = save("2026123456", "b");

        pruner.deleteTokens(List.of(first.getId()));

        assertThat(repository.findAll())
                .extracting(MobilePushToken::getId)
                .containsExactly(second.getId());
    }

    private MobilePushToken save(String studentId, String token) {
        MobilePushToken entity = new MobilePushToken();
        entity.setMemberStudentId(studentId);
        entity.setToken(token);
        entity.setEnabled(true);
        return repository.save(entity);
    }

    private static BatchResponse batchResponse(SendResponse... responses) {
        BatchResponse batch = mock(BatchResponse.class);
        when(batch.getResponses()).thenReturn(List.of(responses));
        return batch;
    }

    private static SendResponse success() {
        SendResponse response = mock(SendResponse.class);
        when(response.isSuccessful()).thenReturn(true);
        return response;
    }

    private static SendResponse failure(MessagingErrorCode code) {
        FirebaseMessagingException exception = mock(FirebaseMessagingException.class);
        when(exception.getMessagingErrorCode()).thenReturn(code);
        SendResponse response = mock(SendResponse.class);
        when(response.isSuccessful()).thenReturn(false);
        when(response.getException()).thenReturn(exception);
        return response;
    }
}
