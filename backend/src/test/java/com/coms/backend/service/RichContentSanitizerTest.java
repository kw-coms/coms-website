package com.coms.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RichContentSanitizerTest {

    private final RichContentSanitizer sanitizer = new RichContentSanitizer();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void acceptsValidYoutubeEmbed() throws Exception {
        String content = "[{\"type\":\"externalEmbed\",\"provider\":\"youtube\",\"kind\":\"youtube\","
                + "\"url\":\"https://www.youtube.com/watch?v=abcdef123\","
                + "\"embedUrl\":\"https://www.youtube.com/embed/abcdef123\",\"title\":\"video\"}]";
        String result = sanitizer.sanitizeContent(content);
        JsonNode block = mapper.readTree(result).get(0);
        assertThat(block.get("kind").asText()).isEqualTo("youtube");
        assertThat(block.get("embedUrl").asText()).isEqualTo("https://www.youtube.com/embed/abcdef123");
    }

    @Test
    void rejectsYoutubeEmbedWithArbitraryOrigin() {
        String content = "[{\"type\":\"externalEmbed\",\"provider\":\"youtube\",\"kind\":\"youtube\","
                + "\"url\":\"https://www.youtube.com/watch?v=abcdef123\","
                + "\"embedUrl\":\"https://evil.example.com/embed/abcdef123\"}]";
        assertThatThrownBy(() -> sanitizer.sanitizeContent(content))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void acceptsLinkCardAndStripsEmbedUrl() throws Exception {
        String content = "[{\"type\":\"externalEmbed\",\"provider\":\"external\",\"kind\":\"link\","
                + "\"url\":\"https://example.com/article\",\"title\":\"Title\","
                + "\"description\":\"Desc\",\"image\":\"https://example.com/cover.png\","
                + "\"siteName\":\"example.com\",\"embedUrl\":\"https://evil.example.com/embed/x\"}]";
        String result = sanitizer.sanitizeContent(content);
        JsonNode block = mapper.readTree(result).get(0);
        assertThat(block.get("kind").asText()).isEqualTo("link");
        assertThat(block.get("url").asText()).isEqualTo("https://example.com/article");
        assertThat(block.get("description").asText()).isEqualTo("Desc");
        assertThat(block.get("image").asText()).isEqualTo("https://example.com/cover.png");
        assertThat(block.get("siteName").asText()).isEqualTo("example.com");
        // a link card must never carry an iframe embedUrl
        assertThat(block.has("embedUrl")).isFalse();
    }

    @Test
    void dropsNonHttpsLinkImage() throws Exception {
        String content = "[{\"type\":\"externalEmbed\",\"provider\":\"external\",\"kind\":\"link\","
                + "\"url\":\"https://example.com\",\"image\":\"http://example.com/x.png\"}]";
        String result = sanitizer.sanitizeContent(content);
        JsonNode block = mapper.readTree(result).get(0);
        assertThat(block.has("image")).isFalse();
    }

    @Test
    void rejectsNonHttpsLinkUrl() {
        String content = "[{\"type\":\"externalEmbed\",\"provider\":\"external\",\"kind\":\"link\","
                + "\"url\":\"http://example.com\"}]";
        assertThatThrownBy(() -> sanitizer.sanitizeContent(content))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rejectsUnknownEmbedKind() {
        String content = "[{\"type\":\"externalEmbed\",\"provider\":\"external\",\"kind\":\"iframe\","
                + "\"url\":\"https://example.com\"}]";
        assertThatThrownBy(() -> sanitizer.sanitizeContent(content))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rejectsScriptInLegacyPlainText() {
        assertThatThrownBy(() -> sanitizer.sanitizeContent("<script>alert(1)</script>"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void passesBlankContentThrough() {
        assertThat(sanitizer.sanitizeContent("")).isEmpty();
        assertThat(sanitizer.sanitizeContent(null)).isNull();
    }
}
