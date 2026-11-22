package com.coms.backend.controller;

import com.coms.backend.dto.ClubFormDto.*;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubFormService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
public class ClubFormController {
    private final ClubFormService forms;
    private final AuditLogService audit;

    public ClubFormController(ClubFormService forms, AuditLogService audit) {
        this.forms = forms;
        this.audit = audit;
    }

    @GetMapping("/api/club-forms")
    public List<Summary> list(Authentication auth) { return forms.list(auth.getName()); }

    @GetMapping("/api/club-forms/{id}")
    public View view(@PathVariable Long id, Authentication auth) { return forms.view(id, auth.getName()); }

    @PutMapping("/api/club-forms/{id}/response")
    public OwnResponse submit(@PathVariable Long id, @RequestBody Submission request, Authentication auth) {
        return forms.submit(id, auth.getName(), request);
    }

    @GetMapping("/api/admin/club-forms")
    public List<Form> adminList() { return forms.adminList(); }

    @PostMapping("/api/admin/club-forms")
    public Form create(@RequestBody Write request, Authentication auth) {
        Form form = forms.save(null, request);
        audit(auth, "CLUB_FORM_CREATE", form.id());
        return form;
    }

    @PutMapping("/api/admin/club-forms/{id}")
    public Form update(@PathVariable Long id, @RequestBody Write request, Authentication auth) {
        Form form = forms.save(id, request);
        audit(auth, "CLUB_FORM_UPDATE", id);
        return form;
    }

    @DeleteMapping("/api/admin/club-forms/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication auth) {
        forms.delete(id);
        audit(auth, "CLUB_FORM_DELETE", id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/admin/club-forms/{id}/responses")
    public Responses responses(@PathVariable Long id, @RequestParam(defaultValue = "0") int page) {
        return forms.responses(id, page);
    }

    private void audit(Authentication auth, String action, Long id) {
        audit.record(auth.getName(), action, "CLUB_FORM", id.toString(), null, null);
    }
}
