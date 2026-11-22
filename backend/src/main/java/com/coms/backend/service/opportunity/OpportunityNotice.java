package com.coms.backend.service.opportunity;

public record OpportunityNotice(
        String sourceKey, String externalId, String sourceName, String sourceUrl, String category, String title,
        String applicationStart, String applicationEnd, String eventStart, String eventEnd, String dateSnippet
) {}
