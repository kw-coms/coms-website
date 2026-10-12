package com.coms.backend.controller;

import com.coms.backend.dto.MeetingPollAvailabilityRequest;
import com.coms.backend.dto.MeetingPollDetailResponse;
import com.coms.backend.dto.MeetingPollRequest;
import com.coms.backend.dto.MeetingPollSummaryResponse;
import com.coms.backend.service.MeetingPollService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Meeting polls ("일정 조율"). Every route needs a signed-in member: the security configuration
 * ends in authenticated() for anything not listed there, and nothing here is listed.
 */
@RestController
@RequestMapping("/api/meeting-polls")
public class MeetingPollController {
    private final MeetingPollService meetingPollService;

    public MeetingPollController(MeetingPollService meetingPollService) {
        this.meetingPollService = meetingPollService;
    }

    @GetMapping
    public ResponseEntity<List<MeetingPollSummaryResponse>> listMeetingPolls(Authentication authentication) {
        return ResponseEntity.ok(meetingPollService.list(authentication.getName()));
    }

    @PostMapping
    public ResponseEntity<MeetingPollDetailResponse> createMeetingPoll(@Valid @RequestBody MeetingPollRequest request,
                                                                       Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED).body(meetingPollService.create(request, authentication.getName()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<MeetingPollDetailResponse> getMeetingPoll(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(meetingPollService.get(id, authentication.getName()));
    }

    @PutMapping("/{id}/availability")
    public ResponseEntity<MeetingPollDetailResponse> saveMeetingPollAvailability(
            @PathVariable Long id,
            @Valid @RequestBody MeetingPollAvailabilityRequest request,
            Authentication authentication) {
        return ResponseEntity.ok(meetingPollService.saveAvailability(id, authentication.getName(), request.slots()));
    }

    @DeleteMapping("/{id}/availability")
    public ResponseEntity<MeetingPollDetailResponse> clearMeetingPollAvailability(@PathVariable Long id,
                                                                                  Authentication authentication) {
        return ResponseEntity.ok(meetingPollService.clearAvailability(id, authentication.getName()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMeetingPoll(@PathVariable Long id, Authentication authentication) {
        meetingPollService.delete(id, authentication.getName());
        return ResponseEntity.noContent().build();
    }
}
