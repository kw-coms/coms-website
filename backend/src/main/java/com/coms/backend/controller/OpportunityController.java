package com.coms.backend.controller;

import com.coms.backend.dto.OpportunityDto.*;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.opportunity.OpportunityCollection;
import com.coms.backend.service.opportunity.OpportunityStore;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
public class OpportunityController {
    private final OpportunityStore store;
    private final OpportunityCollection collection;
    private final AuditLogService audit;

    public OpportunityController(OpportunityStore store, OpportunityCollection collection, AuditLogService audit) {
        this.store = store;
        this.collection = collection;
        this.audit = audit;
    }

    @GetMapping("/api/opportunities")
    public List<Published> published() { return store.published(); }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @GetMapping("/api/admin/opportunities")
    public Candidates candidates(@RequestParam(defaultValue = "PENDING") Status status,
                                 @RequestParam(defaultValue = "0") int page) {
        return store.candidates(status, page);
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @GetMapping("/api/admin/opportunities/collection")
    public CollectionStatus collectionStatus() { return collection.status(); }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @PostMapping("/api/admin/opportunities/collect")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CollectionStatus collect(Authentication authentication) {
        CollectionStatus status = collection.collectNow();
        audit.record(authentication.getName(), "OPPORTUNITY_COLLECT", "EXTERNAL_OPPORTUNITY", null, null, null);
        return status;
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @PutMapping("/api/admin/opportunities/{id}")
    public Candidate review(@PathVariable long id, @RequestBody Review request, Authentication authentication) {
        Candidate result = store.review(id, request);
        audit.record(authentication.getName(), "OPPORTUNITY_" + request.action(), "EXTERNAL_OPPORTUNITY",
                Long.toString(id), null, null);
        return result;
    }
}
