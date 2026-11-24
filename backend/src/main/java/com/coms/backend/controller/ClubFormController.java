package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.dto.ClubFormDto.*;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubFormService;
import com.coms.backend.service.PermissionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
public class ClubFormController {
    private final ClubFormService forms;
    private final AuditLogService audit;
    private final PermissionService permissions;
    private final MemberRepository members;

    public ClubFormController(ClubFormService forms, AuditLogService audit,
                              PermissionService permissions, MemberRepository members) {
        this.forms = forms;
        this.audit = audit;
        this.permissions = permissions;
        this.members = members;
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
    public List<Form> adminList(Authentication auth) {
        boolean admin = requireEditor(auth);
        return forms.adminList().stream().filter(form -> admin || form.category() == Category.STUDY).toList();
    }

    @PostMapping("/api/admin/club-forms")
    public Form create(@RequestBody Write request, Authentication auth) {
        boolean admin = requireEditor(auth);
        if (!admin && (request == null || request.category() != Category.STUDY)) throw forbidden();
        Form form = forms.save(null, request, !admin);
        audit(auth, "CLUB_FORM_CREATE", form.id());
        return form;
    }

    @PutMapping("/api/admin/club-forms/{id}")
    public Form update(@PathVariable Long id, @RequestBody Write request, Authentication auth) {
        boolean admin = requireEditor(auth);
        if (!admin && (request == null || request.category() != Category.STUDY)) throw forbidden();
        Form form = forms.save(id, request, !admin);
        audit(auth, "CLUB_FORM_UPDATE", id);
        return form;
    }

    @DeleteMapping("/api/admin/club-forms/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication auth) {
        forms.delete(id, !requireEditor(auth));
        audit(auth, "CLUB_FORM_DELETE", id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/admin/club-forms/{id}/responses")
    public Responses responses(@PathVariable Long id, @RequestParam(defaultValue = "0") int page, Authentication auth) {
        return forms.responses(id, page, !requireEditor(auth));
    }

    @GetMapping("/api/admin/club-forms/{id}/aggregates")
    public Aggregates aggregates(@PathVariable Long id, Authentication auth) {
        return forms.aggregates(id, !requireEditor(auth));
    }

    private boolean requireEditor(Authentication auth) {
        Member member = members.findByStudentId(auth.getName()).orElseThrow(ClubFormController::forbidden);
        if (member.getRole() == Member.Role.ADMIN) return true;
        if (permissions.has(member, Permission.ACTIVITY_WRITE)) return false;
        throw forbidden();
    }

    private static ResponseStatusException forbidden() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "스터디 설문 관리 권한이 없습니다.");
    }

    private void audit(Authentication auth, String action, Long id) {
        audit.record(auth.getName(), action, "CLUB_FORM", id.toString(), null, null);
    }
}
