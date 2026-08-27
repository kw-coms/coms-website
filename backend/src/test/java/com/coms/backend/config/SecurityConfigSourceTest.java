package com.coms.backend.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityConfigSourceTest {

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
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/notices\").hasAnyRole(\"ADMIN\", \"OFFICER\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PATCH, \"/api/notices/*/pin\").hasAnyRole(\"ADMIN\", \"OFFICER\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PUT, \"/api/notices/**\").hasAnyRole(\"ADMIN\", \"OFFICER\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/notices/**\").hasAnyRole(\"ADMIN\", \"OFFICER\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/files\").authenticated()");
        // Archive moderation is 부회장(VICE_PRESIDENT)+ — ADMIN inherits via the
        // RoleHierarchy bean. The explicit PATCH matcher must exist so the new
        // author-edit endpoint doesn't fall through to the authenticated()
        // catch-all for /api/files/**.
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/files/**\").hasRole(\"VICE_PRESIDENT\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PATCH, \"/api/files/**\").hasRole(\"VICE_PRESIDENT\")");
        assertThat(source.indexOf("auth.requestMatchers(HttpMethod.PATCH, \"/api/files/**\")"))
                .isLessThan(source.indexOf("auth.requestMatchers(\"/api/files\", \"/api/files/**\").authenticated()"));
        assertThat(source).contains("public RoleHierarchy roleHierarchy()");
    }

    @Test
    void clubActivityRecordsAreMemberReadableAndOfficerWritable() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.GET, \"/api/club-activities\", \"/api/club-activities/**\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/club-activities\").hasAnyRole(\"ADMIN\", \"OFFICER\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/club-activities/**\").hasAnyRole(\"ADMIN\", \"OFFICER\")");
    }

    @Test
    void publicSettingsAndOfficerContentAdminRoutesPrecedeSensitiveAdminBoundary() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.GET, \"/api/site-settings\").permitAll()");
        assertThat(source).contains("auth.requestMatchers(\"/api/admin/site-settings\", \"/api/admin/club-activity-categories/**\",");
        assertThat(source).contains("\"/api/admin/club-project-categories/**\", \"/api/admin/recurring-schedules/**\").hasAnyRole(\"ADMIN\", \"OFFICER\")");
        assertThat(source.indexOf("/api/admin/site-settings"))
                .isLessThan(source.indexOf("auth.requestMatchers(\"/api/admin/**\").hasRole(\"ADMIN\")"));
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
