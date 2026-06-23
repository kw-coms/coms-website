package com.coms.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Shared sanitizer for rich-editor block content (the JSON array of text /
 * externalEmbed / poll blocks produced by the reusable rich editor).
 *
 * <p>Community posts, notices, and resources all persist this same block format
 * and must therefore run it through the identical sanitize pipeline. Centralizing
 * the logic here guarantees that a crafted {@code externalEmbed} payload (e.g. an
 * arbitrary-origin iframe disguised as a YouTube embed) is rejected no matter which
 * feature stored it, instead of only community posts being protected.
 */
@Component
public class RichContentSanitizer {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern HTML_TAG = Pattern.compile("<(/?)([A-Za-z][A-Za-z0-9]*)([^>]*)>");
    private static final Pattern STYLE_DECLARATION = Pattern.compile("(?i)(color|background-color)\\s*:\\s*([^;\"']+)");
    private static final Pattern FONT_COLOR = Pattern.compile("(?i)\\bcolor\\s*=\\s*([\"']?)(#[0-9a-fA-F]{3,8}|rgba?\\([0-9.,%\\s]+\\))\\1");
    private static final Pattern SAFE_COLOR = Pattern.compile("(?i)^(#[0-9a-f]{3,8}|rgba?\\([0-9.,%\\s]+\\))$");
    private static final Pattern HTTPS_URL = Pattern.compile("^https://[^\\s<>\"']+$", Pattern.CASE_INSENSITIVE);
    private static final Pattern YOUTUBE_EMBED_URL = Pattern.compile("^https://www\\.youtube(-nocookie)?\\.com/embed/[A-Za-z0-9_-]{6,20}([?&][^\\s<>\"']*)?$", Pattern.CASE_INSENSITIVE);

    /**
     * Sanitizes a stored content string. When the value is a JSON array of blocks it
     * sanitizes each block in place; otherwise it falls back to rejecting any unsafe
     * legacy/plain-text payload and returns it unchanged.
     */
    public String sanitizeContent(String content) {
        if (content == null || content.isBlank()) {
            return content;
        }
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) {
                rejectUnsafeText(content);
                return content;
            }
            ArrayNode sanitized = JSON.createArrayNode();
            for (JsonNode block : root) {
                if (!block.isObject()) continue;
                ObjectNode copy = ((ObjectNode) block).deepCopy();
                String type = copy.path("type").asText();
                if ("text".equals(type)) {
                    copy.put("content", sanitizeRichText(copy.path("content").asText("")));
                } else if ("externalEmbed".equals(type)) {
                    sanitizeExternalEmbed(copy);
                } else if ("poll".equals(type)) {
                    sanitizePollBlock(copy);
                }
                sanitized.add(copy);
            }
            return JSON.writeValueAsString(sanitized);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception ignored) {
            rejectUnsafeText(content);
            return content;
        }
    }

    void sanitizeExternalEmbed(ObjectNode copy) {
        String kind = copy.path("kind").asText("");
        String provider = copy.path("provider").asText("");
        String url = copy.path("url").asText("");
        String embedUrl = copy.path("embedUrl").asText("");
        if (!Set.of("youtube", "image", "video", "link").contains(kind) || !Set.of("youtube", "external").contains(provider)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하지 않는 외부 콘텐츠입니다.");
        }
        if (!url.isBlank() && !HTTPS_URL.matcher(url).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "외부 콘텐츠는 HTTPS URL만 사용할 수 있습니다.");
        }
        if ("youtube".equals(kind)) {
            if (!YOUTUBE_EMBED_URL.matcher(embedUrl).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "YouTube 임베드 주소가 올바르지 않습니다.");
            }
        } else if ("link".equals(kind)) {
            sanitizeLinkEmbed(copy, url);
            return;
        } else if (!HTTPS_URL.matcher(url).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "외부 콘텐츠 주소가 올바르지 않습니다.");
        }
        copy.put("title", normalizeOptional(copy.path("title").asText(""), 160));
        copy.put("thumbnailUrl", normalizeOptional(copy.path("thumbnailUrl").asText(""), 500));
        copy.put("width", Math.max(25, Math.min(100, copy.path("width").asInt(75))));
        copy.put("align", normalizeAlign(copy.path("align").asText("left")));
    }

    /**
     * Generic OG-style link-preview card. Unlike the youtube kind it carries NO iframe /
     * embedUrl, only a clickable URL plus text metadata and an optional thumbnail image.
     * The url must be https; the image must be https too or is dropped. Any stray embedUrl
     * is stripped so a link card can never be turned into an iframe at render time.
     */
    private void sanitizeLinkEmbed(ObjectNode copy, String url) {
        if (!HTTPS_URL.matcher(url).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "링크 카드는 HTTPS URL만 사용할 수 있습니다.");
        }
        copy.remove("embedUrl");
        copy.remove("thumbnailUrl");
        copy.put("title", normalizeOptional(copy.path("title").asText(""), 160));
        copy.put("description", normalizeOptional(copy.path("description").asText(""), 280));
        copy.put("siteName", normalizeOptional(copy.path("siteName").asText(""), 80));
        String image = copy.path("image").asText("");
        if (!image.isBlank() && HTTPS_URL.matcher(image).matches()) {
            copy.put("image", normalizeOptional(image, 500));
        } else {
            copy.remove("image");
        }
        copy.put("width", Math.max(25, Math.min(100, copy.path("width").asInt(75))));
        copy.put("align", normalizeAlign(copy.path("align").asText("center")));
    }

    private void sanitizePollBlock(ObjectNode copy) {
        String pollId = normalizeOptional(copy.path("pollId").asText(""), 80);
        String question = normalizeOptional(copy.path("question").asText(""), 160);
        if (pollId.isBlank() || question.isBlank() || !pollId.matches("[A-Za-z0-9_-]{6,80}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 정보가 올바르지 않습니다.");
        }
        ArrayNode options = JSON.createArrayNode();
        for (JsonNode option : copy.path("options")) {
            ObjectNode optionCopy = JSON.createObjectNode();
            String label = option.isObject()
                    ? normalizeOptional(option.path("label").asText(""), 80)
                    : normalizeOptional(option.asText(""), 80);
            if (label.isBlank()) continue;
            optionCopy.put("label", label);
            if (option.isObject()) {
                String imageUrl = normalizeOptional(option.path("imageUrl").asText(""), 500);
                if (!imageUrl.isBlank()) {
                    if (!HTTPS_URL.matcher(imageUrl).matches()) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 보기 이미지는 HTTPS URL만 사용할 수 있습니다.");
                    }
                    optionCopy.put("imageUrl", imageUrl);
                }
            }
            options.add(optionCopy);
            if (options.size() >= 10) break;
        }
        if (options.size() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 선택지는 2개 이상 필요합니다.");
        }
        copy.set("options", options);
        normalizePollDate(copy, "closesAt");
        normalizePollDate(copy, "closedAt");
    }

    private void normalizePollDate(ObjectNode copy, String fieldName) {
        String value = copy.path(fieldName).asText("");
        if (value.isBlank()) {
            copy.remove(fieldName);
            return;
        }
        try {
            copy.put(fieldName, java.time.LocalDateTime.parse(value).toString());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 종료 시간이 올바르지 않습니다.");
        }
    }

    String normalizeOptional(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > maxLength) {
            normalized = normalized.substring(0, maxLength);
        }
        rejectUnsafeText(normalized);
        return normalized;
    }

    private String normalizeAlign(String align) {
        return Set.of("left", "center", "right").contains(align) ? align : "left";
    }

    void rejectUnsafeText(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.contains("<script") || lower.contains("</script")
                || lower.contains("<iframe") || lower.contains("javascript:")
                || lower.matches(".*\\son[a-z]+\\s*=.*")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보안상 허용되지 않는 내용이 포함되어 있습니다.");
        }
    }

    private String sanitizeRichText(String html) {
        Matcher matcher = HTML_TAG.matcher(html == null ? "" : html);
        StringBuilder out = new StringBuilder();
        int last = 0;
        while (matcher.find()) {
            out.append(escapeHtml(html.substring(last, matcher.start())));
            String closing = matcher.group(1);
            String tag = matcher.group(2).toLowerCase(Locale.ROOT);
            String attrs = matcher.group(3) == null ? "" : matcher.group(3);
            out.append(sanitizeTag(closing, tag, attrs));
            last = matcher.end();
        }
        out.append(escapeHtml((html == null ? "" : html).substring(last)));
        return out.toString()
                .replaceAll("(?i)(<br>\\s*)+$", "")
                .trim();
    }

    private String sanitizeTag(String closing, String tag, String attrs) {
        if ("br".equals(tag)) return "<br>";
        if (Set.of("b", "strong", "i", "em", "u").contains(tag)) {
            return closing.isBlank() ? "<" + tag + ">" : "</" + tag + ">";
        }
        if ("span".equals(tag) || "font".equals(tag)) {
            if (!closing.isBlank()) return "</span>";
            String style = sanitizeInlineColorStyle(attrs);
            return style.isBlank() ? "<span>" : "<span style=\"" + style + "\">";
        }
        return "";
    }

    private String sanitizeInlineColorStyle(String attrs) {
        StringBuilder style = new StringBuilder();
        Matcher styleMatcher = STYLE_DECLARATION.matcher(attrs);
        while (styleMatcher.find()) {
            appendSafeStyle(style, styleMatcher.group(1).toLowerCase(Locale.ROOT), styleMatcher.group(2).trim());
        }
        Matcher fontMatcher = FONT_COLOR.matcher(attrs);
        if (fontMatcher.find()) {
            appendSafeStyle(style, "color", fontMatcher.group(2).trim());
        }
        return style.toString();
    }

    private void appendSafeStyle(StringBuilder style, String key, String value) {
        String cleanValue = value.replaceAll("\\s+", " ");
        if (!SAFE_COLOR.matcher(cleanValue).matches()) return;
        if (style.indexOf(key + ":") >= 0) return;
        if (!style.isEmpty()) style.append(';');
        style.append(key).append(':').append(cleanValue);
    }

    private String escapeHtml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
