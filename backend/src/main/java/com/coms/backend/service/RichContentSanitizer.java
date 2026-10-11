package com.coms.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Iterator;
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
 *
 * <p>Two different jobs live here and are kept apart on purpose:
 * <ul>
 *   <li>{@link #sanitizeContent} rewrites rich text through an allow-list, so its output is safe
 *       by construction — everything that is not an allowed tag with allowed attributes comes
 *       out escaped;</li>
 *   <li>{@link #rejectUnsafeText} is a gate for values that are stored and shown as plain text
 *       (titles, comments, labels). It only objects to active markup, never to prose.</li>
 * </ul>
 */
@Component
public class RichContentSanitizer {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern HTML_TAG = Pattern.compile("<(/?)([A-Za-z][A-Za-z0-9]*)([^>]*)>");
    private static final Pattern STYLE_DECLARATION = Pattern.compile("(?i)(color|background-color)\\s*:\\s*([^;\"']+)");
    // The editor writes the value with its quotes entity-encoded inside the style attribute.
    private static final Pattern FONT_FAMILY_DECLARATION =
            Pattern.compile("(?i)font-family\\s*:\\s*((?:&quot;|&#39;|&#x27;|[^;\"&<>])+)");
    private static final Pattern SAFE_FONT_FAMILY = Pattern.compile("^[\\p{L}\\p{N} _\\-,']{1,120}$");
    private static final Pattern FONT_COLOR = Pattern.compile("(?i)\\bcolor\\s*=\\s*([\"']?)(#[0-9a-fA-F]{3,8}|rgba?\\([0-9.,%\\s]+\\))\\1");
    private static final Pattern SAFE_COLOR = Pattern.compile("(?i)^(#[0-9a-f]{3,8}|rgba?\\([0-9.,%\\s]+\\))$");
    private static final Pattern HTTPS_URL = Pattern.compile("^https://[^\\s<>\"']+$", Pattern.CASE_INSENSITIVE);
    private static final Pattern YOUTUBE_EMBED_URL = Pattern.compile("^https://www\\.youtube(-nocookie)?\\.com/embed/[A-Za-z0-9_-]{6,20}([?&][^\\s<>\"']*)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern HREF_ATTRIBUTE =
            Pattern.compile("(?i)\\bhref\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))");
    private static final Pattern SAFE_LINK_TARGET =
            Pattern.compile("^(?:https?://|mailto:)[^\\s<>\"'`\\\\]{1,2000}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern CODE_LANGUAGE_CLASS =
            Pattern.compile("(?i)\\bclass\\s*=\\s*[\"']?\\s*(language-[a-z0-9]{1,30})\\s*[\"']?(?=\\s|$)");
    // A raw tag opening as an HTML tokenizer sees it: the name runs to whitespace, '/' or '>'.
    private static final Pattern RAW_TAG = Pattern.compile("<\\s*/?\\s*([A-Za-z][^\\s/<>]*)([^<>]*)");
    private static final Pattern EVENT_HANDLER_ATTRIBUTE = Pattern.compile("(?:^|[\\s/\"'])on[a-z]+\\s*=");
    private static final Set<String> MEDIA_WIDTH_NAMES = Set.of("small", "medium", "large", "full");
    private static final Pattern ENTITY = Pattern.compile(
            "&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|(?i:lt|gt|quot|apos|amp|colon|sol|lpar|rpar|tab|newline|nbsp));?");

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
                Set<String> sanitizedFields;
                if ("text".equals(type)) {
                    copy.put("content", sanitizeRichText(copy.path("content").asText("")));
                    sanitizedFields = Set.of("type", "content");
                } else if ("externalEmbed".equals(type)) {
                    sanitizeExternalEmbed(copy);
                    sanitizedFields = Set.of("type", "provider", "kind", "url", "embedUrl", "title",
                            "thumbnailUrl", "description", "siteName", "image", "width", "align");
                } else if ("poll".equals(type)) {
                    sanitizePollBlock(copy);
                    sanitizedFields = Set.of("type", "pollId", "question", "options", "closesAt", "closedAt");
                } else if ("image".equals(type) || "video".equals(type) || "file".equals(type)) {
                    sanitizeAttachmentBlock(copy);
                    sanitizedFields = Set.of("type", "name", "width", "align");
                } else {
                    sanitizedFields = Set.of();
                }
                // Whatever this sanitizer does not understand — an unknown block type, an extra
                // field from another client — is still held to the plain-text gate, so nothing
                // enters storage unchecked.
                rejectUnsafeValues(copy, sanitizedFields);
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
        } else {
            // Only the YouTube kind renders an iframe; a stray embedUrl on an image/video card
            // has no business being stored.
            copy.remove("embedUrl");
        }
        copy.put("title", normalizeOptional(copy.path("title").asText(""), 160));
        String thumbnailUrl = normalizeOptional(copy.path("thumbnailUrl").asText(""), 500);
        copy.put("thumbnailUrl", HTTPS_URL.matcher(thumbnailUrl).matches() ? thumbnailUrl : "");
        copy.remove("description");
        copy.remove("siteName");
        copy.remove("image");
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
        copy.put("pollId", pollId);
        copy.put("question", question);
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

    /** Uploaded image / video / file blocks: only the caption-like fields are free text. */
    private void sanitizeAttachmentBlock(ObjectNode copy) {
        if (copy.hasNonNull("name")) {
            copy.put("name", normalizeOptional(copy.path("name").asText(""), 255));
        }
        if (copy.has("width")) {
            JsonNode width = copy.get("width");
            if (width.isNumber()) {
                copy.put("width", Math.max(25, Math.min(100, width.asInt(75))));
            } else if (!MEDIA_WIDTH_NAMES.contains(width.asText(""))) {
                copy.remove("width");
            }
        }
        if (copy.has("align")) {
            copy.put("align", normalizeAlign(copy.path("align").asText("center")));
        }
    }

    private void rejectUnsafeValues(JsonNode node, Set<String> alreadySanitizedFields) {
        if (node.isTextual()) {
            rejectUnsafeText(node.asText());
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                rejectUnsafeValues(child, Set.of());
            }
        } else if (node.isObject()) {
            for (Iterator<String> names = node.fieldNames(); names.hasNext(); ) {
                String name = names.next();
                if (!alreadySanitizedFields.contains(name)) {
                    rejectUnsafeValues(node.get(name), Set.of());
                }
            }
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

    private static final Set<String> FORBIDDEN_TAGS = Set.of(
            "script", "iframe", "svg", "object", "embed", "style", "img", "math",
            "link", "meta", "form", "base", "video", "audio", "source");

    /**
     * Gate for values that are stored and displayed as plain text. The web client always renders
     * them as text, so this exists for the day some client injects one as HTML: it refuses
     * <em>active markup</em> — a script/iframe/img-style element, or any raw tag carrying an event
     * handler or a script URL.
     *
     * <p>It deliberately says nothing about prose. The previous version matched substrings anywhere
     * (and again after decoding entities), which on a programming club's board rejected ordinary
     * writing: a title like "JavaScript: 기초", {@code const onSubmit = ...}, "Regular
     * Expression(정규식)", and — once decoded — the escaped {@code #include <math.h>} inside a post
     * body. Without a raw {@code <} nothing here can become an element or an attribute, and a tag
     * the tokenizer would not read as one of the dangerous elements (e.g. {@code <math.h>},
     * {@code Map<Object,String>}) is just text.
     */
    void rejectUnsafeText(String value) {
        if (value == null || value.indexOf('<') < 0) {
            return;
        }
        Matcher tag = RAW_TAG.matcher(value);
        while (tag.find()) {
            String name = tag.group(1).toLowerCase(Locale.ROOT);
            // Entities are undone first so java&#115;cript: is seen for what it is. Handlers are
            // looked for in the text as written, because whitespace is what separates attributes;
            // script URLs in a copy with whitespace removed, because browsers ignore tabs and
            // newlines inside a URL ("java&Tab;script:").
            String attributes = decodeEntities(tag.group(2)).toLowerCase(Locale.ROOT);
            String compact = attributes.replaceAll("[\\s\\u0000]", "");
            boolean unsafe = FORBIDDEN_TAGS.contains(name)
                    || EVENT_HANDLER_ATTRIBUTE.matcher(attributes).find()
                    || compact.contains("javascript:")
                    || compact.contains("vbscript:")
                    || compact.contains("data:text/html")
                    || compact.contains("expression(");
            if (unsafe) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보안상 허용되지 않는 내용이 포함되어 있습니다.");
            }
        }
    }

    private String decodeEntities(String value) {
        Matcher matcher = ENTITY.matcher(value);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String entity = matcher.group(1);
            String replacement;
            try {
                if (entity.startsWith("#x") || entity.startsWith("#X")) {
                    replacement = codePoint(Integer.parseInt(entity.substring(2), 16), matcher.group());
                } else if (entity.startsWith("#")) {
                    replacement = codePoint(Integer.parseInt(entity.substring(1)), matcher.group());
                } else {
                    replacement = switch (entity.toLowerCase(Locale.ROOT)) {
                        case "lt" -> "<";
                        case "gt" -> ">";
                        case "quot" -> "\"";
                        case "apos" -> "'";
                        case "amp" -> "&";
                        case "colon" -> ":";
                        case "sol" -> "/";
                        case "lpar" -> "(";
                        case "rpar" -> ")";
                        case "tab" -> "\t";
                        case "newline" -> "\n";
                        case "nbsp" -> " ";
                        default -> matcher.group();
                    };
                }
            } catch (NumberFormatException e) {
                replacement = matcher.group();
            }
            matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    private static String codePoint(int value, String fallback) {
        return Character.isValidCodePoint(value) ? new String(Character.toChars(value)) : fallback;
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

    /**
     * The allow-list. It has to cover what the editor emits — bold/italic/underline, coloured and
     * font-family spans, inline code, fenced code blocks with a language hint, and links — because
     * anything missing here is silently stripped on save: code blocks and links used to lose their
     * markup (and a link its destination) the moment a post was stored.
     */
    private String sanitizeTag(String closing, String tag, String attrs) {
        boolean isClosing = !closing.isBlank();
        if ("br".equals(tag)) return "<br>";
        if (Set.of("b", "strong", "i", "em", "u", "pre").contains(tag)) {
            return isClosing ? "</" + tag + ">" : "<" + tag + ">";
        }
        if ("code".equals(tag)) {
            if (isClosing) return "</code>";
            Matcher language = CODE_LANGUAGE_CLASS.matcher(attrs);
            return language.find()
                    ? "<code class=\"" + language.group(1).toLowerCase(Locale.ROOT) + "\">"
                    : "<code>";
        }
        if ("a".equals(tag)) {
            if (isClosing) return "</a>";
            String href = safeHref(attrs);
            // target/rel are ours, never the caller's: every user link opens in a new tab and
            // cannot reach back into the page that opened it.
            return href == null
                    ? "<a>"
                    : "<a href=\"" + href + "\" target=\"_blank\" rel=\"noopener noreferrer nofollow\">";
        }
        if ("span".equals(tag) || "font".equals(tag)) {
            if (isClosing) return "</span>";
            String style = sanitizeInlineStyle(attrs);
            return style.isBlank() ? "<span>" : "<span style=\"" + style + "\">";
        }
        return "";
    }

    /** The href as it may be written back into an attribute, or null when it is not a plain link. */
    private String safeHref(String attrs) {
        Matcher matcher = HREF_ATTRIBUTE.matcher(attrs);
        if (!matcher.find()) {
            return null;
        }
        String raw = matcher.group(1) != null ? matcher.group(1)
                : matcher.group(2) != null ? matcher.group(2)
                : matcher.group(3);
        String decoded = decodeEntities(raw).trim();
        if (!SAFE_LINK_TARGET.matcher(decoded).matches()) {
            return null;
        }
        return decoded.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private String sanitizeInlineStyle(String attrs) {
        StringBuilder style = new StringBuilder();
        Matcher styleMatcher = STYLE_DECLARATION.matcher(attrs);
        while (styleMatcher.find()) {
            appendSafeStyle(style, styleMatcher.group(1).toLowerCase(Locale.ROOT), styleMatcher.group(2).trim());
        }
        Matcher fontMatcher = FONT_COLOR.matcher(attrs);
        if (fontMatcher.find()) {
            appendSafeStyle(style, "color", fontMatcher.group(2).trim());
        }
        Matcher fontFamilyMatcher = FONT_FAMILY_DECLARATION.matcher(attrs);
        if (fontFamilyMatcher.find()) {
            appendSafeFontFamily(style, fontFamilyMatcher.group(1));
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

    /**
     * Font names only: letters, digits, spaces, commas, hyphens and single quotes. That leaves no
     * way to write a url(), an expression, a second declaration or to close the attribute.
     */
    private void appendSafeFontFamily(StringBuilder style, String rawValue) {
        String value = rawValue
                .replace("&quot;", "'")
                .replace("&#39;", "'")
                .replace("&#x27;", "'")
                .replaceAll("\\s+", " ")
                .trim();
        if (!SAFE_FONT_FAMILY.matcher(value).matches()) return;
        if (value.chars().filter(ch -> ch == '\'').count() % 2 != 0) return;
        if (style.indexOf("font-family:") >= 0) return;
        if (!style.isEmpty()) style.append(';');
        style.append("font-family:").append(value);
    }

    // Only escape ampersands that do not already start an entity: the frontend
    // sends text-block content pre-escaped, so a blind replace("&", "&amp;")
    // stacks one extra entity layer on every save/edit round trip.
    private static final Pattern BARE_AMPERSAND =
            Pattern.compile("&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\\d{1,7}|#x[0-9a-fA-F]{1,6});)");

    private String escapeHtml(String value) {
        return BARE_AMPERSAND.matcher(value).replaceAll("&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
