package com.coms.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;


/**
 * Community text handling: input validation, the denylist safety gate for user text, rich-content
 * sanitization, and the plain-text/preview projections used by list previews, share descriptions and
 * audit logs. Pure transforms over strings, shared by post and comment handling.
 */
@Component
class CommunityTextService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int PREVIEW_LENGTH = 160;

    private final RichContentSanitizer richContentSanitizer;

    CommunityTextService(RichContentSanitizer richContentSanitizer) {
        this.richContentSanitizer = richContentSanitizer;
    }

    String normalizeBounded(String value, String fieldName, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + "을 입력해주세요.");
        }
        if (normalized.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + "은 " + maxLength + "자 이하로 입력해주세요.");
        }
        if (normalized.chars().anyMatch(ch -> Character.isISOControl(ch) && ch != '\n' && ch != '\r' && ch != '\t')) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "허용되지 않는 제어 문자가 포함되어 있습니다.");
        }
        return normalized;
    }

    void rejectUnsafeText(String value) {
        // Delegate to the hardened entity-decoding check; keeping a local copy
        // here silently reverted the denylist->widened-check security fix.
        richContentSanitizer.rejectUnsafeText(value);
    }

    /** The stricter gate kept for anonymous nicknames (see RichContentSanitizer). */
    void rejectUnsafeTextStrict(String value) {
        richContentSanitizer.rejectUnsafeTextStrict(value);
    }

    String sanitizeContent(String content) {
        return richContentSanitizer.sanitizeContent(content);
    }

    String preview(String content) {
        if (content == null || content.length() <= PREVIEW_LENGTH) {
            return content;
        }
        return content.substring(0, PREVIEW_LENGTH);
    }

    String shareDescription(String content) {
        String plainText = plainTextContent(content).replaceAll("\\s+", " ").trim();
        return preview(plainText);
    }

    String plainTextContent(String content) {
        if (content == null || content.isBlank()) {
            return "";
        }
        try {
            JsonNode root = JSON.readTree(content);
            if (!root.isArray()) {
                return stripHtml(content);
            }
            StringBuilder out = new StringBuilder();
            int images = 0;
            int videos = 0;
            int files = 0;
            for (JsonNode block : root) {
                if (!block.isObject()) continue;
                String type = block.path("type").asText();
                switch (type) {
                    case "image" -> images++;
                    case "video" -> videos++;
                    case "file" -> files++;
                    default -> { }
                }
                String text = switch (type) {
                    case "text" -> stripHtml(block.path("content").asText(""));
                    case "poll" -> block.path("question").asText("");
                    case "externalEmbed" -> block.path("title").asText("");
                    default -> "";
                };
                if (!text.isBlank()) {
                    if (!out.isEmpty()) out.append(' ');
                    out.append(text.trim());
                }
            }
            if (!out.isEmpty()) {
                return out.toString();
            }
            // A post made only of attachments has no sentence to show. Falling back to the stored
            // body printed its JSON ("[{"type":"image","mediaId":…") as the list preview.
            java.util.List<String> parts = new java.util.ArrayList<>();
            if (images > 0) parts.add("사진 " + images + "장");
            if (videos > 0) parts.add("영상 " + videos + "개");
            if (files > 0) parts.add("첨부파일 " + files + "개");
            return String.join(" · ", parts);
        } catch (Exception ignored) {
            return stripHtml(content);
        }
    }

    String stripHtml(String value) {
        return value == null ? "" : value
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("<[^>]+>", "")
                .replace("&nbsp;", " ")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
    }

    // ---- Audit-log text formatting -----------------------------------------------------------
    // Shared by post and comment deletion audit details. The collapse-to-single-line normalisation
    // is a defence against injected newlines forging extra audit key=value lines.

    String safeTitle(String title) {
        return title == null || title.isBlank() ? null : "title=" + preview(title);
    }

    String auditIdentity(String name, String studentId) {
        String safeName = name == null || name.isBlank() ? "-" : name.trim();
        String safeStudentId = studentId == null || studentId.isBlank() ? "-" : studentId.trim();
        return safeName + "(" + safeStudentId + ")";
    }

    String auditTextPreview(String value) {
        String normalized = plainTextContent(value).replaceAll("\\s+", " ").trim();
        return normalized.isEmpty() ? null : preview(normalized);
    }

    String normalizeDeleteReason(String reason, int maxLength) {
        String normalized = reason == null ? "" : reason.trim().replaceAll("\\s+", " ");
        if (normalized.isEmpty()) return null;
        if (normalized.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "삭제 사유는 " + maxLength + "자 이하로 입력해주세요.");
        }
        rejectUnsafeText(normalized);
        return normalized;
    }
}
