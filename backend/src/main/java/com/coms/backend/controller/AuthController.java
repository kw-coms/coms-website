package com.coms.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = {
        "http://localhost:5173",
        "https://main.d2y2jv10z2f3v2.amplifyapp.com"
})
public class AuthController {

    private final Map<String, SignupRequest> members = new ConcurrentHashMap<>();

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody SignupRequest request) {
        if (isBlank(request.studentId()) ||
                isBlank(request.name()) ||
                isBlank(request.email()) ||
                isBlank(request.password())) {
            return ResponseEntity
                    .badRequest()
                    .body(Map.of("message", "필수 정보를 모두 입력해주세요."));
        }

        if (request.password().length() < 8) {
            return ResponseEntity
                    .badRequest()
                    .body(Map.of("message", "비밀번호는 8자 이상이어야 합니다."));
        }

        if (members.containsKey(request.studentId())) {
            return ResponseEntity
                    .status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "이미 가입된 학번입니다."));
        }

        members.put(request.studentId(), request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(Map.of(
                        "message", "회원가입 신청이 완료되었습니다.",
                        "studentId", request.studentId(),
                        "name", request.name()
                ));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        SignupRequest member = members.get(request.identifier());

        if (member == null || !member.password().equals(request.password())) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "아이디 또는 비밀번호가 올바르지 않습니다."));
        }

        return ResponseEntity.ok(Map.of(
                "message", "로그인 성공",
                "studentId", member.studentId(),
                "name", member.name()
        ));
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    public record SignupRequest(
            String studentId,
            String name,
            String email,
            String password,
            String department,
            String phone
    ) {
    }

    public record LoginRequest(
            String identifier,
            String password
    ) {
    }
}