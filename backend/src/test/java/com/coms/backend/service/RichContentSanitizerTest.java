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
    void rejectsEventHandlerInLegacyPlainText() {
        assertThatThrownBy(() -> sanitizer.sanitizeContent("<b onclick=alert(1)>text</b>"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void passesBlankContentThrough() {
        assertThat(sanitizer.sanitizeContent("")).isEmpty();
        assertThat(sanitizer.sanitizeContent(null)).isNull();
    }

    @Test
    void sanitizeContentIsIdempotentForAlreadyEscapedText() throws Exception {
        String content = "[{\"type\":\"text\",\"content\":\"A &amp; B<br>C &lt;tag&gt; &quot;q&quot;\"}]";
        String once = sanitizer.sanitizeContent(content);
        assertThat(mapper.readTree(once).get(0).get("content").asText())
                .isEqualTo("A &amp; B<br>C &lt;tag&gt; &quot;q&quot;");
        assertThat(sanitizer.sanitizeContent(once)).isEqualTo(once);
    }

    @Test
    void sanitizeContentStillEscapesBareAmpersand() throws Exception {
        String content = "[{\"type\":\"text\",\"content\":\"A & B\"}]";
        String result = sanitizer.sanitizeContent(content);
        assertThat(mapper.readTree(result).get(0).get("content").asText()).isEqualTo("A &amp; B");
    }

    // ---- What the editor emits must survive a save ------------------------------------------

    @Test
    void codeBlocksInlineCodeAndLinksSurviveSanitization() throws Exception {
        String html = "<pre><code class=\"language-js\">const a = 1;\nconsole.log(a)</code></pre>"
                + "<code>npm ci</code> "
                + "<a href=\"https://example.com/docs?a=1&amp;b=2\" target=\"_self\" rel=\"opener\">문서</a>";

        String sanitized = textBlock(html);

        assertThat(sanitized)
                .contains("<pre><code class=\"language-js\">const a = 1;\nconsole.log(a)</code></pre>")
                .contains("<code>npm ci</code>")
                // The destination is kept; target/rel are always ours, never the caller's.
                .contains("<a href=\"https://example.com/docs?a=1&amp;b=2\" target=\"_blank\" rel=\"noopener noreferrer nofollow\">문서</a>");
        assertThat(textBlock(sanitized)).isEqualTo(sanitized);
    }

    @Test
    void codeClassIsReducedToSingleLanguageHint() throws Exception {
        assertThat(textBlock("<code class=\"language-python evil\" onclick=\"x()\">print(1)</code>"))
                .isEqualTo("<code class=\"language-python\">print(1)</code>");
        assertThat(textBlock("<code class=\"hljs danger\">x</code>")).isEqualTo("<code>x</code>");
    }

    @Test
    void linksWithScriptOrUnknownSchemesLoseTheirDestination() throws Exception {
        for (String href : new String[]{
                "javascript:alert(1)",
                "java&#115;cript:alert(1)",
                "jav&Tab;ascript:alert(1)",
                " javascript:alert(1)",
                "data:text/html,<b>x</b>",
                "vbscript:msgbox(1)",
                "//evil.example.com",
        }) {
            String sanitized = textBlock("<a href=\"" + href + "\">링크</a>");
            assertThat(sanitized).as(href)
                    .doesNotContainIgnoringCase("script:")
                    .doesNotContain("data:");
            assertThat(sanitized).as(href).startsWith("<a>").endsWith("</a>");
        }
        assertThat(textBlock("<a href=\"mailto:club@example.com\">메일</a>"))
                .startsWith("<a href=\"mailto:club@example.com\"");
        // An attribute smuggled in next to a valid href is simply not carried over.
        assertThat(textBlock("<a href=\"https://example.com/\" onmouseover=\"alert(1)\" style=\"x\">링크</a>"))
                .isEqualTo("<a href=\"https://example.com/\" target=\"_blank\" rel=\"noopener noreferrer nofollow\">링크</a>");
    }

    @Test
    void fontFamilyIsKeptOnlyWhenItIsPlainFontNames() throws Exception {
        assertThat(textBlock("<span style=\"color: #ff0000; font-family: &quot;Noto Sans KR&quot;, sans-serif\">글</span>"))
                .isEqualTo("<span style=\"color:#ff0000;font-family:'Noto Sans KR', sans-serif\">글</span>");
        assertThat(textBlock("<span style=\"font-family: Pretendard\">글</span>"))
                .isEqualTo("<span style=\"font-family:Pretendard\">글</span>");
        for (String value : new String[]{
                "x; background: url(https://evil.example.com/a.png)",
                "expression(alert(1))",
                "url(javascript:alert(1))",
                "a\\\"b",
        }) {
            assertThat(textBlock("<span style=\"font-family: " + value + "\">글</span>")).as(value)
                    .doesNotContain("url(")
                    .doesNotContain("expression")
                    .doesNotContain("background");
        }
    }

    @Test
    void escapedCodeInsidePostBodyIsStoredNotRejected() throws Exception {
        // The editor sends text already escaped. Decoding it again and then refusing the result
        // is what made a C include, an HTML snippet or a JS handler impossible to post.
        String html = "#include &lt;math.h&gt;<br>&lt;script&gt;alert(1)&lt;/script&gt;<br>"
                + "&lt;img src=x onerror=alert(1)&gt;<br>const onSubmit = () =&gt; {}";

        assertThat(textBlock(html)).isEqualTo(html);
    }

    @Test
    void activeMarkupInsidePostBodyIsNeutralized() throws Exception {
        String sanitized = textBlock("<script>alert(1)</script><img src=x onerror=alert(1)>"
                + "<b onclick=\"alert(1)\">굵게</b><iframe src=\"https://evil.example.com\"></iframe>");

        assertThat(sanitized).isEqualTo("alert(1)<b>굵게</b>");
    }

    // ---- The plain-text gate ---------------------------------------------------------------

    @Test
    void ordinaryProseAndCodeTalkPassThePlainTextGate() {
        for (String text : new String[]{
                "JavaScript: 기초 정리",
                "const onSubmit = () => {}",
                "int one = 1; only = true",
                "Regular Expression(정규식) 정리",
                "#include <math.h> 넣으면 됩니다",
                "Map<Object,String> vs vector<int>",
                "a < b && c > d",
                "data:text/html 스킴이 뭔가요?",
                "&lt;script&gt; 는 이렇게 이스케이프합니다",
                "<b>굵게</b> 는 그냥 글자로 보입니다",
                "<a href=\"https://example.com\">링크 문법</a>",
        }) {
            sanitizer.rejectUnsafeText(text);
        }
    }

    @Test
    void activeMarkupFailsThePlainTextGate() {
        for (String text : new String[]{
                "<script>alert(1)</script>",
                "<SCRIPT src=//evil.example.com/x.js>",
                "< script >alert(1)",
                "<scr<script>ipt>alert(1)",
                "<img src=x onerror=alert(1)>",
                "<svg/onload=alert(1)>",
                "<iframe src=\"https://evil.example.com\">",
                "<math><mi xlink:href=\"x\">",
                "<b onclick=alert(1)>text</b>",
                "<b title=x\tonmouseover=alert(1)>text</b>",
                "<details open ontoggle=alert(1)>",
                "<a href=\"javascript:alert(1)\">x</a>",
                "<a href=\"java&#115;cript:alert(1)\">x</a>",
                "<a href=\"jav&Tab;ascript:alert(1)\">x</a>",
                "<a href=\"jav\nascript:alert(1)\">x</a>",
                "<a href=\"data:text/html,x\">x</a>",
                "<div style=\"width: expression(alert(1))\">",
                "<img src=x onerror=alert(1)",
        }) {
            assertThatThrownBy(() -> sanitizer.rejectUnsafeText(text)).as(text)
                    .isInstanceOf(ResponseStatusException.class);
        }
    }

    @Test
    void unknownBlocksAndExtraFieldsAreStillGated() {
        assertThatThrownBy(() -> sanitizer.sanitizeContent(
                "[{\"type\":\"widget\",\"html\":\"<img src=x onerror=alert(1)>\"}]"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> sanitizer.sanitizeContent(
                "[{\"type\":\"text\",\"content\":\"본문\",\"note\":\"<script>alert(1)</script>\"}]"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void attachmentBlocksKeepTheirReferencesAndNormalizeLayout() throws Exception {
        JsonNode blocks = mapper.readTree(sanitizer.sanitizeContent(
                "[{\"type\":\"image\",\"mediaId\":7,\"name\":\"발표 자료.png\",\"width\":400,\"align\":\"sideways\"},"
                        + "{\"type\":\"video\",\"mediaId\":8,\"width\":\"large\"},"
                        + "{\"type\":\"file\",\"fileId\":9,\"name\":\"자료.zip\"}]"));

        assertThat(blocks.get(0).get("mediaId").asLong()).isEqualTo(7);
        assertThat(blocks.get(0).get("name").asText()).isEqualTo("발표 자료.png");
        assertThat(blocks.get(0).get("width").asInt()).isEqualTo(100);
        assertThat(blocks.get(0).get("align").asText()).isEqualTo("left");
        assertThat(blocks.get(1).get("width").asText()).isEqualTo("large");
        assertThat(blocks.get(2).get("fileId").asLong()).isEqualTo(9);
    }

    @Test
    void pollTextIsStoredTrimmedAndBounded() throws Exception {
        JsonNode poll = mapper.readTree(sanitizer.sanitizeContent(
                "[{\"type\":\"poll\",\"pollId\":\"poll-abc123\",\"question\":\"  " + "가".repeat(300) + "  \","
                        + "\"options\":[\"예\",\"아니오\"]}]")).get(0);

        assertThat(poll.get("question").asText()).hasSize(160);
    }

    // ---- Text the member did not type --------------------------------------------------------

    @Test
    void aLinkCardKeepsAPageTitleThatLooksLikeMarkup() throws Exception {
        // What a link preview returns for MDN's page about the script element. Refusing it made the
        // whole post unsaveable once previews started carrying real titles.
        String content = mapper.writeValueAsString(mapper.createArrayNode().add(mapper.createObjectNode()
                .put("type", "externalEmbed").put("provider", "external").put("kind", "link")
                .put("url", "https://developer.mozilla.org/docs/Web/HTML/Element/script")
                .put("title", "<script>: The Script element - HTML | MDN")
                .put("description", "The <script> element embeds code, e.g. <img src=x onerror=alert(1)>.")
                .put("siteName", "MDN <Web> Docs")));

        JsonNode block = mapper.readTree(sanitizer.sanitizeContent(content)).get(0);

        assertThat(block.get("title").asText()).isEqualTo("\u2039script\u203A: The Script element - HTML | MDN");
        assertThat(block.get("description").asText()).contains("\u2039img src=x onerror=alert(1)\u203A");
        assertThat(block.get("siteName").asText()).isEqualTo("MDN \u2039Web\u203A Docs");
        assertThat(block.toString()).doesNotContain("<").doesNotContain(">");
    }

    @Test
    void aVideoCardAndAnUploadNameAreMadeInertToo() throws Exception {
        String content = mapper.writeValueAsString(mapper.createArrayNode()
                .add(mapper.createObjectNode()
                        .put("type", "externalEmbed").put("provider", "youtube").put("kind", "youtube")
                        .put("url", "https://www.youtube.com/watch?v=abcdef123")
                        .put("embedUrl", "https://www.youtube.com/embed/abcdef123")
                        .put("title", "HTML <img> 태그 10분 정리"))
                .add(mapper.createObjectNode()
                        .put("type", "file").put("fileId", 7).put("name", "<form> 예제 모음.zip")));

        JsonNode blocks = mapper.readTree(sanitizer.sanitizeContent(content));

        assertThat(blocks.get(0).get("title").asText()).isEqualTo("HTML \u2039img\u203A 태그 10분 정리");
        assertThat(blocks.get(1).get("name").asText()).isEqualTo("\u2039form\u203A 예제 모음.zip");
        assertThat(blocks.get(1).get("fileId").asInt()).isEqualTo(7);
        // Even a name written to look like an attack is only text once its brackets are gone.
        assertThat(mapper.readTree(sanitizer.sanitizeContent(
                "[{\"type\":\"image\",\"mediaId\":3,\"name\":\"<svg onload=alert(1)>.png\"}]")).get(0).get("name").asText())
                .isEqualTo("\u2039svg onload=alert(1)\u203A.png");
    }

    @Test
    void whatTheMemberTypesIsStillRefusedRatherThanRewritten() {
        // A poll question is the member's own text: active markup in it is refused, as before.
        assertThatThrownBy(() -> sanitizer.sanitizeContent(
                "[{\"type\":\"poll\",\"pollId\":\"poll-abc123\",\"question\":\"<script>alert(1)</script>\","
                        + "\"options\":[\"예\",\"아니오\"]}]"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void aQuotedAngleBracketDoesNotHideTheRestOfATag() {
        // A browser ends a tag at the first '>' outside a quoted value; the gate used to stop at
        // the first '>' of any kind and never saw the handler behind it.
        for (String text : new String[] {
                "<a title=\">\" onmouseover=alert(1)>x</a>",
                "<a title='>' href=\"javascript:alert(1)\">x</a>",
                "<b data-x=\"a>b\" onclick = go()>",
        }) {
            assertThatThrownBy(() -> sanitizer.rejectUnsafeText(text)).as(text)
                    .isInstanceOf(ResponseStatusException.class);
        }
        // Ordinary writing with brackets and quotes is still just text.
        for (String text : new String[] {
                "#include <math.h> 하고 \"math\" 를 씁니다",
                "Map<Object,String> m = new HashMap<>(); // \"빈 맵\"",
                "a < b 이고 b > c 이면 \"a < c\" 입니다",
                "const onSubmit = () => save()",
        }) {
            sanitizer.rejectUnsafeText(text);
        }
    }

    @Test
    void theStrictGateKeepsThePreviousRule() {
        for (String text : new String[] {"javascript:x", "a onclick=b", "<imgur>", "&#x3C;script&#x3E;"}) {
            assertThatThrownBy(() -> sanitizer.rejectUnsafeTextStrict(text)).as(text)
                    .isInstanceOf(ResponseStatusException.class);
        }
        sanitizer.rejectUnsafeTextStrict("C++ 좋아");
        sanitizer.rejectUnsafeTextStrict("익명 <3");
        sanitizer.rejectUnsafeTextStrict(null);
    }

    private String textBlock(String html) throws Exception {
        String content = mapper.writeValueAsString(
                mapper.createArrayNode().add(mapper.createObjectNode().put("type", "text").put("content", html)));
        return mapper.readTree(sanitizer.sanitizeContent(content)).get(0).get("content").asText();
    }
}
