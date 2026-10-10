package com.coms.backend.controller;

import com.coms.backend.dto.RecruitApplicationRequest;
import com.coms.backend.dto.RecruitApplicationResponse;
import com.coms.backend.dto.RecruitApplicationStatusLookupRequest;
import com.coms.backend.dto.RecruitApplicationStatusResponse;
import com.coms.backend.service.RecruitApplicationService;
import com.coms.backend.security.ClientIpResolver;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/recruit")
public class RecruitController {
    private final RecruitApplicationService recruitApplicationService;
    private final ClientIpResolver clientIpResolver;

    public RecruitController(RecruitApplicationService recruitApplicationService, ClientIpResolver clientIpResolver) {
        this.recruitApplicationService = recruitApplicationService;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping("/apply")
    public ResponseEntity<RecruitApplicationResponse> apply(@Valid @RequestBody RecruitApplicationRequest request,
                                                            HttpServletRequest servletRequest) {
        recruitApplicationService.sendApplication(request, clientIpResolver.resolve(servletRequest));
        return ResponseEntity.ok(new RecruitApplicationResponse("지원서가 제출되었습니다."));
    }

    @PostMapping("/status")
    public ResponseEntity<RecruitApplicationStatusResponse> status(@Valid @RequestBody RecruitApplicationStatusLookupRequest request,
                                                                   HttpServletRequest servletRequest) {
        return ResponseEntity.ok(recruitApplicationService.lookupStatus(request, clientIpResolver.resolve(servletRequest)));
    }
}
