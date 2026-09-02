package com.coms.backend.dto;

/**
 * 기수 변경 요청. 값 검증은 {@code AdminService.updateGeneration} 한 곳에서만 한다 —
 * 예전에는 DTO 의 @Pattern 과 서비스의 정규식이 각각 검사하면서 둘 다 "000" 같은
 * 0 기수를 통과시켰다.
 */
public record GenerationUpdateRequest(String generation) {
}
