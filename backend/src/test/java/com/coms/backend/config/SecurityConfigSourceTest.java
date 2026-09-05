package com.coms.backend.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityConfigSourceTest {

    private static String controller(String name) throws Exception {
        return Files.readString(Path.of("src/main/java/com/coms/backend/controller/" + name));
    }

    private static String service(String name) throws Exception {
        return Files.readString(Path.of("src/main/java/com/coms/backend/service/" + name));
    }

    @Test
    void maintenanceAddEligibleIsNotPermitAll() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/maintenance/bootstrap\").permitAll()");
        assertThat(source).doesNotContain("\"/api/maintenance/bootstrap\", \"/api/maintenance/add-eligible\"");
        assertThat(source).contains("auth.requestMatchers(\"/api/maintenance/**\").hasRole(\"ADMIN\")");
    }

    @Test
    void noticeMutationsRequireAdminAndArchiveUploadRequiresLogin() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.GET, \"/api/notices\", \"/api/notices/**\").authenticated()");
        assertThat(source).doesNotContain("auth.requestMatchers(HttpMethod.GET, \"/api/notices\", \"/api/notices/**\").permitAll()");
        // 공지 변경은 이제 notice.write 권한 게이트 — URL 규칙은 로그인 경계까지만 낮추고
        // 실제 판정은 NoticeController 의 @perm.has 가 한다. 익명 요청은 여전히 못 들어온다.
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/notices\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PATCH, \"/api/notices/*/pin\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PUT, \"/api/notices/**\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/notices/**\").authenticated()");
        assertThat(source).doesNotContain("\"/api/notices\").permitAll()");
        String noticeController = controller("NoticeController.java");
        assertThat(noticeController.split("@PreAuthorize\\(\"@perm.has\\(authentication,'NOTICE_WRITE'\\)\"\\)", -1))
                .hasSize(5); // create, update, pin, delete
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/files\").authenticated()");
        // Archive moderation is archive.manage — the explicit DELETE/PATCH matchers must
        // still exist (ahead of the /api/files/** catch-all) so the intent is readable,
        // and ArchiveController carries the real permission gate.
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/files/**\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PATCH, \"/api/files/**\").authenticated()");
        assertThat(source.indexOf("auth.requestMatchers(HttpMethod.PATCH, \"/api/files/**\")"))
                .isLessThan(source.indexOf("auth.requestMatchers(\"/api/files\", \"/api/files/**\").authenticated()"));
        String archiveController = controller("ArchiveController.java");
        assertThat(archiveController.split("@PreAuthorize\\(\"@perm.has\\(authentication,'ARCHIVE_MANAGE'\\)\"\\)", -1))
                .hasSize(3); // author edit, delete
        assertThat(source).contains("public RoleHierarchy roleHierarchy()");
    }

    @Test
    void clubActivityRecordsAreMemberReadableAndOfficerWritable() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.GET, \"/api/club-activities\", \"/api/club-activities/**\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/club-activities\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/club-activities/**\").authenticated()");
        // 쓰기는 activity.write 권한 — 컨트롤러와 서비스 양쪽에 게이트가 남아 있어야 한다.
        assertThat(controller("ClubActivityController.java")).contains("@PreAuthorize(\"@perm.has(authentication,'ACTIVITY_WRITE')\")");
        assertThat(service("ClubActivityService.java")).contains("@PreAuthorize(\"@perm.has(authentication,'ACTIVITY_WRITE')\")");
        assertThat(service("ClubActivityService.java")).doesNotContain("hasAnyRole('ADMIN','OFFICER')");
        // 투표는 권한과 무관하게 로그인 회원 전체.
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/club-activities/*/vote\").authenticated()");
    }

    @Test
    void publicSettingsAndOfficerContentAdminRoutesPrecedeSensitiveAdminBoundary() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.GET, \"/api/site-settings\").permitAll()");
        assertThat(source).contains("auth.requestMatchers(\"/api/admin/site-settings\", \"/api/admin/club-room\", \"/api/admin/club-activity-categories/**\",");
        // 동아리방 비밀번호: club_room.view 권한 게이트. URL 은 로그인 경계까지만 낮추고
        // 판정은 SiteSettingsController 가 한다 — 익명 요청은 여전히 통과 못 한다.
        assertThat(source).contains("auth.requestMatchers(\"/api/club-room\").authenticated()");
        assertThat(source).doesNotContain("auth.requestMatchers(\"/api/club-room\").permitAll()");
        assertThat(controller("SiteSettingsController.java"))
                .contains("@PreAuthorize(\"@perm.has(authentication,'CLUB_ROOM_VIEW')\")")
                .contains("@PreAuthorize(\"@perm.has(authentication,'SITE_SETTINGS_EDIT')\")");
        assertThat(source).contains(".role(\"USER\").implies(\"ASSOCIATE\")");
        assertThat(source).contains("\"/api/admin/club-project-categories/**\", \"/api/admin/recurring-schedules/**\").authenticated()");
        // 임원/부회장이 쓰는 admin 경로는 권한 게이트로 낮췄지만, 민감한 나머지
        // /api/admin/** 는 여전히 회장 전용 경계로 남아야 한다.
        assertThat(source).contains("auth.requestMatchers(\"/api/admin/community/**\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(\"/api/admin/**\").hasRole(\"ADMIN\")");
        assertThat(source.indexOf("/api/admin/site-settings"))
                .isLessThan(source.indexOf("auth.requestMatchers(\"/api/admin/**\").hasRole(\"ADMIN\")"));
        assertThat(source.indexOf("auth.requestMatchers(\"/api/admin/community/**\")"))
                .isLessThan(source.indexOf("auth.requestMatchers(\"/api/admin/**\").hasRole(\"ADMIN\")"));
        // 회장 전용으로 남는 경계들 — 권한 매트릭스로 열 수 없어야 한다.
        assertThat(source).contains("auth.requestMatchers(\"/api/maintenance/**\").hasRole(\"ADMIN\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PATCH, \"/api/notices/*/author\").hasRole(\"ADMIN\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PATCH, \"/api/community/posts/*/author\").hasRole(\"ADMIN\")");
        assertThat(source).contains("auth.requestMatchers(\"/actuator/**\").hasRole(\"ADMIN\")");
    }

    @Test
    void permissionGatedRoutesNeverBecomeAnonymous() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        // 권한 매트릭스로 옮긴 경로들은 "로그인 필요"까지만 낮춘다. permitAll 로
        // 내려가면 매트릭스와 무관하게 익명에게 열리므로 절대 금지.
        for (String path : new String[]{
                "/api/club-room",
                "/api/admin/community/**",
                "/api/notices/**",
                "/api/club-activities/**",
                "/api/club-events/**",
                "/api/files/**",
                "/api/community/posts/*/pin"
        }) {
            assertThat(source).doesNotContain("\"" + path + "\").permitAll()");
        }
    }

    @Test
    void communityModerationIsPermissionGatedEverywhere() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.PATCH, \"/api/community/posts/*/pin\").authenticated()");
        assertThat(controller("CommunityController.java")).contains("@PreAuthorize(\"@perm.has(authentication,'COMMUNITY_MODERATE')\")");
        assertThat(controller("AdminController.java")).contains("@PreAuthorize(\"@perm.has(authentication,'COMMUNITY_MODERATE')\")");
        assertThat(service("CommunityDeletionArchiveService.java"))
                .contains("@PreAuthorize(\"@perm.has(authentication,'COMMUNITY_MODERATE')\")")
                .doesNotContain("hasRole('VICE_PRESIDENT')");
        assertThat(service("CommunityAccess.java")).contains("permissionService.has(member, Permission.COMMUNITY_MODERATE)");
    }

    @Test
    void communitySharePreviewRoutesArePublicButCommunityApiStaysPrivate() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.GET, \"/api/community/posts/*/share\", \"/api/community/posts/*/share-data\", \"/api/community/posts/*/share-image\").permitAll()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.HEAD, \"/api/community/posts/*/share\", \"/api/community/posts/*/share-data\", \"/api/community/posts/*/share-image\").permitAll()");
        assertThat(source).contains("auth.requestMatchers(\"/api/community/**\").authenticated()");
    }

    @Test
    void miniAppSharedDocumentsRequireComsLogin() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).doesNotContain("auth.requestMatchers(HttpMethod.GET, \"/api/mini-apps/*/shared\", \"/api/mini-apps/*/shared/*\").permitAll()");
        assertThat(source).doesNotContain("auth.requestMatchers(HttpMethod.HEAD, \"/api/mini-apps/*/shared\", \"/api/mini-apps/*/shared/*\").permitAll()");
        assertThat(source).contains("auth.requestMatchers(\"/api/mini-apps/**\").authenticated()");
    }

    @Test
    void corsAllowedOriginsHasNoLocalhostFallback() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));
        String properties = Files.readString(Path.of("src/main/resources/application.properties"));

        assertThat(source).contains("@Value(\"${cors.allowed-origins}\")");
        assertThat(source).doesNotContain("cors.allowed-origins:http://localhost:5173");
        assertThat(properties).contains("cors.allowed-origins=${CORS_ALLOWED_ORIGINS}");
        assertThat(properties).doesNotContain("CORS_ALLOWED_ORIGINS:http://localhost:5173");
    }
}
