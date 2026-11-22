package com.coms.backend.service.opportunity;

import com.coms.backend.dto.OpportunityDto.Category;
import com.coms.backend.dto.OpportunityDto.CollectionStatus;
import com.coms.backend.dto.OpportunityDto.SourceReport;
import com.coms.backend.dto.OpportunityDto.SourceResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class OpportunityCollection {
    private static final Logger LOG = LoggerFactory.getLogger(OpportunityCollection.class);
    private static final int MAX_RECORDS_PER_SOURCE = 30;
    private static final int DAILY_AI_LIMIT = 6;

    private final OpportunityStore store;
    private final OpportunitySources sources;
    private final OpportunityDateExtraction dates;
    private final TaskExecutor executor;
    private final boolean enabled;

    public OpportunityCollection(OpportunityStore store, OpportunitySources sources, OpportunityDateExtraction dates,
                                 @Qualifier("opportunityExecutor") TaskExecutor executor,
                                 @Value("${coms.opportunities.enabled:false}") boolean enabled) {
        this.store = store;
        this.sources = sources;
        this.dates = dates;
        this.executor = executor;
        this.enabled = enabled;
    }

    public CollectionStatus status() { return store.collectionStatus(enabled); }

    public CollectionStatus collectNow() {
        if (!enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "외부 공고 수집이 꺼져 있습니다.");
        if (start()) return status();
        CollectionStatus current = status();
        if (current.running()) return current;
        throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "공고 수집은 15분에 한 번 실행할 수 있습니다.");
    }

    @Scheduled(initialDelayString = "${coms.opportunities.initial-delay:PT3M}",
               fixedDelayString = "${coms.opportunities.interval:PT6H}")
    public void scheduled() {
        if (enabled) start();
    }

    private boolean start() {
        String lease = UUID.randomUUID().toString();
        if (!store.acquire(lease)) return false;
        try {
            executor.execute(() -> run(lease));
        } catch (TaskRejectedException ignored) {
            store.finish(lease, List.of());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "공고 수집을 잠시 후 다시 시도해 주세요.");
        }
        return true;
    }

    private void run(String lease) {
        List<SourceReport> reports = new ArrayList<>();
        try {
            for (OpportunitySources.Source source : sources.sources()) {
                reports.add(collectSource(source, lease));
            }
        } finally {
            store.finish(lease, reports);
        }
    }

    private SourceReport collectSource(OpportunitySources.Source source, String lease) {
        int found = 0;
        int changed = 0;
        try {
            List<OpportunityNotice> notices = source.fetch().get();
            for (OpportunityNotice notice : notices.stream().limit(MAX_RECORDS_PER_SOURCE).toList()) {
                if (!source.key().equals(notice.sourceKey())) continue;
                found++;
                if (collect(notice, lease)) changed++;
            }
            return new SourceReport(source.key(), source.name(), SourceResult.SUCCESS, found, changed);
        } catch (RuntimeException e) {
            // The downloaded document and upstream exception message may contain unwanted data.
            LOG.warn("External opportunity source {} failed ({})", source.key(), e.getClass().getSimpleName());
            return new SourceReport(source.key(), source.name(), SourceResult.ERROR, found, changed);
        }
    }

    private boolean collect(OpportunityNotice notice, String lease) {
        var evidence = dates.prepareSnippet(notice.dateSnippet());
        var prepared = store.prepare(notice, evidence.orElse(""));
        if (prepared.isEmpty() || store.unchanged(prepared.get())) return false;

        var baseline = prepared.get().content();
        boolean needsDate = baseline.category() == Category.CONTEST
                ? baseline.eventStart() == null : baseline.applicationEnd() == null;
        var candidate = baseline;
        if (needsDate && evidence.isPresent() && dates.enabled() && store.claimAiAttempt(lease, DAILY_AI_LIMIT)) {
            candidate = dates.extract(evidence.get(), baseline.category().name())
                    .map(value -> OpportunityStore.fillDates(baseline, value)).orElse(baseline);
        }
        return store.saveCollected(prepared.get(), candidate);
    }
}
