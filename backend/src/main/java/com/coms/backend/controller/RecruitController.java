package com.coms.backend.controller;

import com.coms.backend.dto.RecruitApplicationRequest;
import com.coms.backend.dto.RecruitApplicationResponse;
import com.coms.backend.service.RecruitApplicationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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

    @PostMapping("/applications")
    public ResponseEntity<RecruitApplicationResponse> apply(@Valid @RequestBody RecruitApplicationRequest request) {
        recruitApplicationService.submit(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new RecruitApplicationResponse("지원서가 접수되었습니다. 입력하신 이메일로 접수 확인 메일을 보냈습니다."));
    }
}
