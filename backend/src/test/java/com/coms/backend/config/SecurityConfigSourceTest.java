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

        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/notices\").hasRole(\"ADMIN\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.PUT, \"/api/notices/**\").hasRole(\"ADMIN\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/notices/**\").hasRole(\"ADMIN\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/files\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/files/**\").hasRole(\"ADMIN\")");
    }

    @Test
    void clubActivityRecordsAreMemberReadableAndAdminWritable() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/coms/backend/config/SecurityConfig.java"));

        assertThat(source).contains("auth.requestMatchers(HttpMethod.GET, \"/api/club-activities\", \"/api/club-activities/**\").authenticated()");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.POST, \"/api/club-activities\").hasRole(\"ADMIN\")");
        assertThat(source).contains("auth.requestMatchers(HttpMethod.DELETE, \"/api/club-activities/**\").hasRole(\"ADMIN\")");
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
}
