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
}
