package com.coms.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** What a board row, a share card and an audit entry show for a post body. */
class CommunityTextServiceTest {

    private final CommunityTextService text = new CommunityTextService(new RichContentSanitizer());

    @Test
    void thePreviewOfABlockPostIsItsTextNotItsStorageFormat() {
        String content = "[{\"type\":\"text\",\"content\":\"<b>첫 문단</b><br>둘째 줄\"},"
                + "{\"type\":\"image\",\"mediaId\":3,\"name\":\"사진.png\"},"
                + "{\"type\":\"poll\",\"pollId\":\"poll-abc123\",\"question\":\"어느 쪽?\",\"options\":[\"가\",\"나\"]},"
                + "{\"type\":\"externalEmbed\",\"provider\":\"external\",\"kind\":\"link\",\"url\":\"https://example.com\",\"title\":\"예시 사이트\"}]";

        assertThat(text.shareDescription(content)).isEqualTo("첫 문단 둘째 줄 어느 쪽? 예시 사이트");
    }

    @Test
    void aPostMadeOnlyOfAttachmentsGetsALabelInsteadOfItsJson() {
        String content = "[{\"type\":\"image\",\"mediaId\":3,\"name\":\"a.png\",\"width\":75,\"align\":\"center\"},"
                + "{\"type\":\"image\",\"mediaId\":4,\"name\":\"b.png\",\"width\":75,\"align\":\"center\"},"
                + "{\"type\":\"video\",\"mediaId\":9,\"name\":\"demo.mp4\"},"
                + "{\"type\":\"file\",\"fileId\":2,\"name\":\"자료.zip\"}]";

        String preview = text.shareDescription(content);

        // It used to be the first 160 characters of the stored array, so a row read
        // [{"type":"image","mediaId":3,… and a search for "image" matched every such post.
        assertThat(preview).isEqualTo("사진 2장 · 영상 1개 · 첨부파일 1개");
        assertThat(preview).doesNotContain("type").doesNotContain("mediaId");
    }

    @Test
    void anEmptyBlockArrayHasAnEmptyPreview() {
        assertThat(text.shareDescription("[]")).isEmpty();
        assertThat(text.shareDescription("[{\"type\":\"text\",\"content\":\"\"}]")).isEmpty();
    }

    @Test
    void textFromBeforeTheBlockEditorIsShownAsItIs() {
        assertThat(text.shareDescription("그냥 쓴 글\n둘째 줄")).isEqualTo("그냥 쓴 글 둘째 줄");
        assertThat(text.shareDescription(null)).isEmpty();
    }

    @Test
    void eachEntityIsUndoneOnce() {
        // What reads "&quot;" on the page is stored as "&amp;quot;". Undoing the ampersand first
        // let it join what followed into a new entity, and the preview showed a quotation mark.
        String content = "[{\"type\":\"text\",\"content\":\"HTML 은 &amp;quot; 와 &amp;lt;b&amp;gt; 를 씁니다 &quot;이렇게&quot; Q&amp;A\"}]";

        assertThat(text.shareDescription(content)).isEqualTo("HTML 은 &quot; 와 &lt;b&gt; 를 씁니다 \"이렇게\" Q&A");
    }

    @Test
    void aLongBodyIsCutAtTheListPreviewLength() {
        String content = "[{\"type\":\"text\",\"content\":\"" + "가".repeat(400) + "\"}]";

        assertThat(text.shareDescription(content)).hasSize(160);
    }
}
