package com.coms.backend.dto;

/**
 * Typed 후원자 페이지 디자인 설정 — also the PUT body.
 *
 * <p>Unknown keys are refused: {@code SponsorService} binds the request body with its own
 * {@link com.fasterxml.jackson.databind.ObjectMapper}, which keeps Jackson's default
 * {@code FAIL_ON_UNKNOWN_PROPERTIES}. (Spring Boot turns that off on the shared MVC mapper, and
 * {@code @JsonIgnoreProperties(ignoreUnknown = false)} is indistinguishable from "unset" to
 * Jackson, so neither would reject anything on its own.)
 *
 * <p>{@code introHtml} and {@code howToSection.bodyHtml} are rich-editor block content
 * and go through the shared {@code RichContentSanitizer} before they are stored, exactly
 * like a notice body.
 */
public record SponsorPageSettings(
        String heroTitle,
        String heroSubtitle,
        Long bannerImageId,
        String introHtml,
        String accentColor,
        String layout,
        Boolean showTierLabels,
        String thankYouMessage,
        HowToSection howToSection,
        Boolean showCounts
) {
    public record HowToSection(
            String title,
            String bodyHtml,
            String contactEmail,
            String contactLink,
            String bankNote
    ) {
    }
}
