package com.coms.backend.service;

import com.coms.backend.domain.MobilePushToken;
import com.coms.backend.repository.MobilePushTokenRepository;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.Notification;
import com.google.firebase.messaging.SendResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Best-effort Firebase Cloud Messaging (FCM) sender.
 *
 * <p>Fully gated: the sender stays disabled unless {@code push.enabled=true} AND a readable
 * service-account JSON exists at {@code push.firebase.credentials-path}. When disabled (the
 * default — no credentials present), every send is a logged no-op and NEVER throws, so the
 * in-app notification transaction is unaffected.
 */
@Component
public class PushNotificationSender {

    private static final Logger log = LoggerFactory.getLogger(PushNotificationSender.class);
    private static final String FIREBASE_APP_NAME = "coms-push";

    private final MobilePushTokenRepository pushTokenRepository;
    private final boolean enabled;
    private final String credentialsPath;

    private volatile FirebaseApp firebaseApp;
    private volatile boolean initFailed;

    public PushNotificationSender(MobilePushTokenRepository pushTokenRepository,
                                  @Value("${push.enabled:false}") boolean enabled,
                                  @Value("${push.firebase.credentials-path:}") String credentialsPath) {
        this.pushTokenRepository = pushTokenRepository;
        this.enabled = enabled;
        this.credentialsPath = credentialsPath == null ? "" : credentialsPath.trim();
    }

    /**
     * Sends an FCM push to every enabled device token registered for the given member.
     * All failures are swallowed and logged; this method never throws.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public void sendToMember(String recipientStudentId, String title, String body, Map<String, String> data) {
        if (recipientStudentId == null || recipientStudentId.isBlank()) {
            return;
        }
        FirebaseMessaging messaging = messaging();
        if (messaging == null) {
            log.debug("Push disabled — skipping FCM send to {}", recipientStudentId);
            return;
        }
        try {
            List<MobilePushToken> tokens =
                    pushTokenRepository.findByMemberStudentIdAndEnabledTrue(recipientStudentId);
            if (tokens.isEmpty()) {
                return;
            }
            List<String> registrationTokens = new ArrayList<>(tokens.size());
            for (MobilePushToken token : tokens) {
                if (token.getToken() != null && !token.getToken().isBlank()) {
                    registrationTokens.add(token.getToken());
                }
            }
            if (registrationTokens.isEmpty()) {
                return;
            }

            MulticastMessage.Builder builder = MulticastMessage.builder()
                    .addAllTokens(registrationTokens)
                    .setNotification(Notification.builder()
                            .setTitle(title)
                            .setBody(body)
                            .build());
            if (data != null && !data.isEmpty()) {
                builder.putAllData(data);
            }

            BatchResponse response = messaging.sendEachForMulticast(builder.build());
            pruneInvalidTokens(tokens, registrationTokens, response);
        } catch (Exception e) {
            log.warn("FCM push to {} failed (ignored): {}", recipientStudentId, e.toString());
        }
    }

    /**
     * Removes tokens that FCM reports as unregistered/invalid. Best-effort only — any error
     * here is swallowed so it can never break the caller.
     */
    private void pruneInvalidTokens(List<MobilePushToken> tokens,
                                    List<String> registrationTokens,
                                    BatchResponse response) {
        try {
            List<SendResponse> responses = response.getResponses();
            List<MobilePushToken> toDelete = new ArrayList<>();
            for (int i = 0; i < responses.size(); i++) {
                SendResponse r = responses.get(i);
                if (r.isSuccessful() || r.getException() == null) {
                    continue;
                }
                var code = r.getException().getMessagingErrorCode();
                if (code != null && switch (code) {
                    case UNREGISTERED, INVALID_ARGUMENT -> true;
                    default -> false;
                }) {
                    String badToken = registrationTokens.get(i);
                    tokens.stream()
                            .filter(t -> badToken.equals(t.getToken()))
                            .findFirst()
                            .ifPresent(toDelete::add);
                }
            }
            if (!toDelete.isEmpty()) {
                pushTokenRepository.deleteAll(toDelete);
                log.info("Pruned {} invalid FCM token(s)", toDelete.size());
            }
        } catch (Exception e) {
            log.debug("Token pruning skipped: {}", e.toString());
        }
    }

    /**
     * Lazily resolves the FirebaseMessaging client, or {@code null} when push is disabled or
     * Firebase cannot be initialized. Initialization is attempted at most once.
     */
    private FirebaseMessaging messaging() {
        if (!enabled || initFailed) {
            return null;
        }
        FirebaseApp app = firebaseApp;
        if (app == null) {
            app = initialize();
        }
        if (app == null) {
            return null;
        }
        try {
            return FirebaseMessaging.getInstance(app);
        } catch (Exception e) {
            log.warn("FirebaseMessaging unavailable (ignored): {}", e.toString());
            return null;
        }
    }

    private synchronized FirebaseApp initialize() {
        if (firebaseApp != null) {
            return firebaseApp;
        }
        if (initFailed) {
            return null;
        }
        if (!enabled) {
            initFailed = true;
            return null;
        }
        if (credentialsPath.isEmpty()) {
            log.info("Push enabled but push.firebase.credentials-path is blank — FCM disabled (no-op).");
            initFailed = true;
            return null;
        }
        Path path = Path.of(credentialsPath);
        if (!Files.isReadable(path)) {
            log.warn("Push enabled but Firebase credentials file not readable at {} — FCM disabled (no-op).",
                    credentialsPath);
            initFailed = true;
            return null;
        }
        try (InputStream serviceAccount = new FileInputStream(path.toFile())) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                    .build();
            // Use a named app so we never collide with any other FirebaseApp instance.
            FirebaseApp app;
            try {
                app = FirebaseApp.getInstance(FIREBASE_APP_NAME);
            } catch (IllegalStateException notYetInitialized) {
                app = FirebaseApp.initializeApp(options, FIREBASE_APP_NAME);
            }
            this.firebaseApp = app;
            log.info("Firebase Admin initialized from {} — FCM push enabled.", credentialsPath);
            return app;
        } catch (Exception e) {
            log.warn("Firebase Admin initialization failed (FCM disabled): {}", e.toString());
            initFailed = true;
            return null;
        }
    }
}
