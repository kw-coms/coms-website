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

    @Test
    void androidAppLinksManifestIsServedAsJsonAheadOfTheSpaFallback() throws Exception {
        String source = Files.readString(Path.of("../nginx.frontend.conf"));

        assertThat(source).contains("location = /.well-known/assetlinks.json");
        assertThat(source).contains("default_type application/json");
        // 정확 일치(=) 위치라도 SPA fallback 보다 앞에 있어야 읽기 쉽고, 순서가 뒤집히면
        // 나중에 prefix 위치로 바뀌었을 때 조용히 index.html 이 나간다.
        assertThat(source.indexOf("location = /.well-known/assetlinks.json"))
                .isLessThan(source.indexOf("location / {"));
    }

    @Test
    void assetlinksManifestIsValidAndDeclaresTheMemberAppPackage() throws Exception {
        String json = Files.readString(Path.of("../public/.well-known/assetlinks.json"));

        assertThat(json).contains("delegate_permission/common.handle_all_urls");
        assertThat(json).contains("kr.ac.kw.coms.memberapp");
        assertThat(json).contains("03:AE:6C:4D:36:12:F9:8D:C6:77:B1:1D:4D:78:96:9D:7F:BB:D2:34:72:8A:F0:36:9F:AA:D5:71:DE:41:3B:6A");
    }
}
