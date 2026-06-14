package com.coms.backend.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class NginxFrontendConfigTest {

    @Test
    void kakaoPreviewBotsReceiveCommunityShareHtml() throws Exception {
        String source = Files.readString(Path.of("../nginx.frontend.conf"));

        assertThat(source).contains("map $http_user_agent $community_entry_uri");
        assertThat(source).contains("~*(facebookexternalhit|facebot|twitterbot|slackbot|discordbot|kakaotalk|kakaostory|kakaocorp|telegrambot|linkedinbot|whatsapp|bot|crawler|spider)");
        assertThat(source).contains("set $community_post_id $1");
        assertThat(source).contains("location ~ ^/community/([0-9]+)$");
        assertThat(source).contains("try_files $uri $uri/ $community_entry_uri");
        assertThat(source).contains("/api/community/posts/$community_post_id/share");
        assertThat(source).contains("proxy_pass http://coms-backend:8080");
    }
}
