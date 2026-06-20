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

import java.util.Set;

@RestController
@RequestMapping("/api/recruit")
public class RecruitController {

    private static final Set<String> TRUSTED_PROXIES = Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1");

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
        if (TRUSTED_PROXIES.contains(remoteAddr)) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                String candidate = forwarded.split(",")[0].trim();
                if (isValidIp(candidate)) return candidate;
            }
            String realIp = request.getHeader("X-Real-IP");
            if (realIp != null && !realIp.isBlank() && isValidIp(realIp.trim())) {
                return realIp.trim();
            }
        }
        return remoteAddr == null || remoteAddr.isBlank() ? "unknown" : remoteAddr;
    }

    private static boolean isValidIp(String ip) {
        if (ip == null || ip.length() > 45) return false;
        try {
            java.net.InetAddress.getByName(ip);
            return !ip.contains(" ");
        } catch (java.net.UnknownHostException e) {
            return false;
        }
    }
}
