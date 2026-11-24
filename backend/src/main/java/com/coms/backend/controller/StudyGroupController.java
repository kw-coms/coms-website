package com.coms.backend.controller;

import com.coms.backend.dto.StudyGroupDto.*;
import com.coms.backend.service.StudyGroupService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/study-groups")
public class StudyGroupController {
    private final StudyGroupService studies;
    public StudyGroupController(StudyGroupService studies) { this.studies = studies; }

    @GetMapping
    public List<Card> listStudyGroups(@RequestParam(defaultValue = "recent") String sort, Authentication auth) {
        return studies.list(auth == null ? null : auth.getName(), sort);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public View createStudyGroup(@Valid @RequestBody Write write, @RequestParam(defaultValue = "false") boolean direct, Authentication auth) {
        return studies.create(write, auth.getName(), direct);
    }

    @GetMapping("/{id}")
    public View getStudyGroup(@PathVariable Long id, Authentication auth) { return studies.view(id, auth.getName()); }

    @PutMapping("/{id}")
    public View updateStudyGroup(@PathVariable Long id, @RequestBody Write write, Authentication auth) {
        return studies.update(id, write, auth.getName());
    }

    @PostMapping("/{id}/approve")
    public View approveStudyGroup(@PathVariable Long id, Authentication auth) { return studies.approve(id, auth.getName()); }

    @PostMapping("/{id}/start")
    public View startStudyGroup(@PathVariable Long id, Authentication auth) { return studies.activate(id, auth.getName()); }

    @PostMapping("/{id}/end")
    public View endStudyGroup(@PathVariable Long id, Authentication auth) { return studies.end(id, auth.getName()); }

    @PutMapping("/{id}/leader")
    public View replaceStudyLeader(@PathVariable Long id, @Valid @RequestBody LeaderWrite write, Authentication auth) {
        return studies.appointLeader(id, write.studentId(), auth.getName());
    }

    @PostMapping("/{id}/join")
    public MemberView joinStudyGroup(@PathVariable Long id, Authentication auth) { return studies.join(id, auth.getName()); }

    @DeleteMapping("/{id}/members/me")
    public ResponseEntity<Void> leaveStudyGroup(@PathVariable Long id, Authentication auth) {
        studies.leave(id, auth.getName());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/members")
    public List<MemberView> listStudyMembers(@PathVariable Long id, Authentication auth) {
        return studies.memberList(id, auth.getName());
    }

    @PutMapping("/{id}/members/{studentId}")
    public ResponseEntity<MemberView> decideStudyMember(@PathVariable Long id, @PathVariable String studentId,
                                             @Valid @RequestBody MembershipDecision decision, Authentication auth) {
        MemberView result = studies.decideMember(id, studentId, decision.approved(), auth.getName());
        return result == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(result);
    }

    @DeleteMapping("/{id}/members/{studentId}")
    public ResponseEntity<Void> removeStudyMember(@PathVariable Long id, @PathVariable String studentId, Authentication auth) {
        studies.removeMember(id, studentId, auth.getName());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/interest")
    public InterestSummary getStudyInterest(@PathVariable Long id, Authentication auth) { return studies.interest(id, auth.getName()); }

    @PutMapping("/{id}/interest")
    public InterestOwn setStudyInterest(@PathVariable Long id, @RequestBody InterestWrite write, Authentication auth) {
        return studies.setInterest(id, write, auth.getName());
    }

    @DeleteMapping("/{id}/interest")
    public ResponseEntity<Void> clearStudyInterest(@PathVariable Long id, Authentication auth) {
        studies.clearInterest(id, auth.getName());
        return ResponseEntity.noContent().build();
    }
}
