package com.coms.backend.controller;

import com.coms.backend.dto.ClubOfficerDto.TermView;
import com.coms.backend.service.ClubOfficerService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 로그인한 회원용 역대 회장단. 임기는 연도 내림차순, 같은 해에서는 나중 임기가 먼저. */
@RestController
@RequestMapping("/api/club-officers")
public class ClubOfficerController {
    private final ClubOfficerService service;

    public ClubOfficerController(ClubOfficerService service) {
        this.service = service;
    }

    @GetMapping
    public List<TermView> list() {
        return service.list();
    }
}
