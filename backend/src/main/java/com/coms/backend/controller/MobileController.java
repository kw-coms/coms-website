package com.coms.backend.controller;

import com.coms.backend.dto.MobileAppConfigResponse;
import com.coms.backend.dto.MobileHomeResponse;
import com.coms.backend.dto.PushTokenRequest;
import com.coms.backend.service.ArchiveService;
import com.coms.backend.service.CommunityService;
import com.coms.backend.service.MobilePushTokenService;
import com.coms.backend.service.NoticeService;
import com.coms.backend.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mobile/v1")
public class MobileController {

    private final NoticeService noticeService;
    private final CommunityService communityService;
    private final ArchiveService archiveService;
    private final NotificationService notificationService;
    private final MobilePushTokenService mobilePushTokenService;

    @Value("${mobile.minimum-supported-version:0.1.0}")
    private String minimumSupportedVersion;

    @Value("${mobile.latest-version:0.1.0}")
    private String latestVersion;

    @Value("${mobile.update-url:https://coms.kw.ac.kr}")
    private String updateUrl;

    @Value("${mobile.maintenance-message:}")
    private String maintenanceMessage;

    @Value("${mobile.push-enabled:true}")
    private boolean pushEnabled;

    public MobileController(NoticeService noticeService,
                            CommunityService communityService,
                            ArchiveService archiveService,
                            NotificationService notificationService,
                            MobilePushTokenService mobilePushTokenService) {
        this.noticeService = noticeService;
        this.communityService = communityService;
        this.archiveService = archiveService;
        this.notificationService = notificationService;
        this.mobilePushTokenService = mobilePushTokenService;
    }

    @GetMapping("/home")
    public ResponseEntity<MobileHomeResponse> home(Authentication authentication) {
        String studentId = authentication.getName();
        return ResponseEntity.ok(new MobileHomeResponse(
                noticeService.listLimited(5),
                communityService.listLimited(studentId, 5),
                archiveService.listLimited(4, null),
                notificationService.summary(studentId),
                notificationService.list(studentId)
        ));
    }

    @GetMapping("/app-config")
    public ResponseEntity<MobileAppConfigResponse> appConfig() {
        return ResponseEntity.ok(new MobileAppConfigResponse(
                minimumSupportedVersion,
                latestVersion,
                updateUrl,
                maintenanceMessage,
                pushEnabled
        ));
    }

    @PostMapping("/push-tokens")
    public ResponseEntity<Void> registerPushToken(Authentication authentication,
                                                  @Valid @RequestBody PushTokenRequest request) {
        mobilePushTokenService.register(authentication.getName(), request);
        return ResponseEntity.noContent().build();
    }
}
