package com.coms.backend.controller;

import java.util.Date;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class Controller {

    @RequestMapping("/hello")
    public String hello() {
        return "Hello world";
    }

    @GetMapping("/api/server/time")
    public String time() {
        return "안녕하세요. 현재 서버시간은 " + new Date() + "입니다. \n";
    }
    
}