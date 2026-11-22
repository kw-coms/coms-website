package com.coms.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;

public final class OpportunityDto {
    private OpportunityDto() {}

    public enum Category { HACKATHON, CONTEST, TRAINING }
    public enum Status { PENDING, PUBLISHED, IGNORED }
    public enum Action { PUBLISH, IGNORE, UNPUBLISH }
    public enum SourceResult { SUCCESS, ERROR }

    public record Published(long id, Category category, String title, String sourceName, String sourceUrl,
                            String applicationStart, String applicationEnd, String eventStart, String eventEnd,
                            OffsetDateTime publishedAt) {}

    public record Candidate(long id, Category category, String title, String sourceName, String sourceUrl,
                            String applicationStart, String applicationEnd, String eventStart, String eventEnd,
                            OffsetDateTime publishedAt, Status status, long version, OffsetDateTime collectedAt,
                            boolean published, boolean aiAssisted) {}

    public record Review(Long version, Action action, String title, Category category, String applicationStart,
                         String applicationEnd, String eventStart, String eventEnd) {}

    public record Candidates(List<Candidate> items, long total, int page, int size) {}
    public record SourceReport(String key, String name, SourceResult result, int found, int changed) {}
    public record CollectionStatus(boolean enabled, boolean running, OffsetDateTime lastRunAt,
                                   List<SourceReport> sources) {}
}
