package com.coms.backend.service;

import com.coms.backend.repository.MobilePushTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Deletes FCM tokens that Firebase has reported as unregistered/invalid.
 *
 * <p>Deliberately a separate bean rather than a method on {@link PushNotificationSender}: the
 * sender runs inside a {@code readOnly = true} transaction, so a delete issued there is never
 * flushed. Self-invocation would not help either — the {@code @Transactional} proxy is bypassed
 * when a bean calls its own method — so the write has to cross a real bean boundary to get its
 * own writable {@code REQUIRES_NEW} transaction.
 */
@Service
public class PushTokenPruner {

    private final MobilePushTokenRepository pushTokenRepository;

    public PushTokenPruner(MobilePushTokenRepository pushTokenRepository) {
        this.pushTokenRepository = pushTokenRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deleteTokens(List<Long> tokenIds) {
        if (tokenIds == null || tokenIds.isEmpty()) {
            return;
        }
        pushTokenRepository.deleteAllById(tokenIds);
    }
}
