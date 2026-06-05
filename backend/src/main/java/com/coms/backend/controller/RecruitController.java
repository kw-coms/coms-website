package com.coms.backend.controller;

import com.coms.backend.dto.RecruitApplicationRequest;
import com.coms.backend.dto.RecruitApplicationResponse;
import com.coms.backend.service.RecruitApplicationService;
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

    public RecruitController(RecruitApplicationService recruitApplicationService) {
        this.recruitApplicationService = recruitApplicationService;
    }

    @PostMapping("/apply")
    public ResponseEntity<RecruitApplicationResponse> apply(@Valid @RequestBody RecruitApplicationRequest request,
                                                            HttpServletRequest servletRequest) {
        recruitApplicationService.sendApplication(request, resolveClientIp(servletRequest));
        return ResponseEntity.ok(new RecruitApplicationResponse("지원서가 제출되었습니다."));
    }

    private static String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        return remoteAddr == null || remoteAddr.isBlank() ? "unknown" : remoteAddr;
    }
}
