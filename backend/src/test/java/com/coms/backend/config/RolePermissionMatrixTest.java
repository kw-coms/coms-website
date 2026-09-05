package com.coms.backend.config;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.PermissionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 권한 매트릭스가 실제로 게이트를 움직이는지 — 키마다 대표 엔드포인트를 하나씩 골라
 * (1) 기본 매트릭스가 오늘의 동작을 그대로 재현하고, (2) 회장이 허용/회수하면 그 즉시
 * 대표 엔드포인트의 응답이 바뀌며, (3) 회장 자신은 무엇을 지워도 항상 통과하고,
 * (4) 비로그인 요청은 어떤 설정에서도 들어오지 못한다는 것을 확인한다.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:role-permission-matrix-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class RolePermissionMatrixTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";

    /**
     * 권한 하나 = 대표 엔드포인트 하나. {@code allowedStatus} 는 권한이 있을 때,
     * {@code deniedStatus} 는 없을 때의 응답. 존재하지 않는 리소스를 건드리는 케이스는
     * "게이트는 통과했다"는 뜻으로 404 를 허용 상태로 쓴다.
     */
    private record Case(Permission permission,
                        int allowedStatus,
                        int deniedStatus,
                        Supplier<MockHttpServletRequestBuilder> request) {
        @Override
        public String toString() {
            return permission.key();
        }
    }

    private static Stream<Case> cases() {
        return Stream.of(
                new Case(Permission.CLUB_ROOM_VIEW, 200, 403,
                        () -> get("/api/club-room")),
                new Case(Permission.COMMUNITY_ANONYMOUS_BOARD, 201, 400,
                        () -> json(post("/api/community/posts"),
                                """
                                {"title":"익명 글","content":"본문","category":"ANONYMOUS","anonymousName":"익명"}
                                """)),
                new Case(Permission.COMMUNITY_MODERATE, 200, 403,
                        () -> get("/api/admin/community/reports")),
                new Case(Permission.NOTICE_WRITE, 201, 403,
                        () -> json(post("/api/notices"),
                                """
                                {"title":"공지","content":"내용","pinned":false,"category":"GENERAL"}
                                """)),
                new Case(Permission.ACTIVITY_WRITE, 200, 403,
                        () -> get("/api/admin/recurring-schedules")),
                new Case(Permission.PROJECT_WRITE, 404, 403,
                        () -> origin(delete("/api/club-projects/999999"))),
                new Case(Permission.ARCHIVE_MANAGE, 404, 403,
                        () -> origin(delete("/api/files/999999"))),
                new Case(Permission.SITE_SETTINGS_EDIT, 200, 403,
                        () -> get("/api/admin/site-settings"))
        );
    }

    private static MockHttpServletRequestBuilder origin(MockHttpServletRequestBuilder builder) {
        return builder.header("Origin", ORIGIN);
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return origin(builder).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<Member.Role, Cookie> cookies = new EnumMap<>(Member.Role.class);

    @BeforeEach
    void setUp() throws Exception {
        memberRepository.deleteAll();
        cookies.clear();
        int suffix = 1;
        for (Member.Role role : Member.Role.values()) {
            String studentId = String.format("20260000%02d", suffix++);
            memberRepository.save(member(studentId, role));
            cookies.put(role, new Cookie("token", jwtTokenProvider.generateToken(studentId, 0)));
        }
        // PermissionService 캐시는 싱글턴이라 트랜잭션 롤백으로 되돌아가지 않는다.
        // 매 테스트를 기본 매트릭스에서 시작하도록 명시적으로 다시 써 준다.
        putMatrix(defaults());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    void defaultMatrixReproducesTodaysBehaviour(Case testCase) throws Exception {
        for (Member.Role role : PermissionService.editableRoles()) {
            boolean expectedAllowed = testCase.permission().defaultRoles().contains(role);
            assertThat(statusFor(testCase, role))
                    .as("%s / %s (기본값)", testCase.permission().key(), role)
                    .isEqualTo(expectedAllowed ? testCase.allowedStatus() : testCase.deniedStatus());
        }
        // 회장은 매트릭스에 존재하지 않으며 언제나 통과한다.
        assertThat(statusFor(testCase, Member.Role.ADMIN))
                .as("%s / 회장", testCase.permission().key())
                .isEqualTo(testCase.allowedStatus());
        // 비로그인 요청은 매트릭스와 무관하게 거부된다.
        assertThat(mockMvc.perform(testCase.request().get()).andReturn().getResponse().getStatus())
                .as("%s / 비로그인", testCase.permission().key())
                .isIn(401, 403);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    void grantingAndRevokingMovesTheGate(Case testCase) throws Exception {
        Permission permission = testCase.permission();

        // 회장이 회원(USER)과 임원(OFFICER)에게 허용하면 즉시 열린다.
        Map<Member.Role, Set<Permission>> granted = defaults();
        granted.get(Member.Role.USER).add(permission);
        granted.get(Member.Role.OFFICER).add(permission);
        putMatrix(granted);
        assertThat(statusFor(testCase, Member.Role.USER))
                .as("%s / 회원 허용", permission.key())
                .isEqualTo(testCase.allowedStatus());
        assertThat(statusFor(testCase, Member.Role.OFFICER))
                .as("%s / 임원 허용", permission.key())
                .isEqualTo(testCase.allowedStatus());

        // 회수하면 기본 허용 직급(임원)까지 포함해 즉시 닫힌다.
        Map<Member.Role, Set<Permission>> revoked = defaults();
        revoked.values().forEach(permissions -> {
            permissions.remove(permission);
            // 중재 권한 보유자는 익명게시판 게이트를 설계상 그대로 통과한다(신고 처리를 위해).
            // 회수가 실제로 닫히는지 보려면 중재 권한도 같이 내려야 한다.
            permissions.remove(Permission.COMMUNITY_MODERATE);
        });
        putMatrix(revoked);
        assertThat(statusFor(testCase, Member.Role.USER))
                .as("%s / 회원 회수", permission.key())
                .isEqualTo(testCase.deniedStatus());
        assertThat(statusFor(testCase, Member.Role.OFFICER))
                .as("%s / 임원 회수", permission.key())
                .isEqualTo(testCase.deniedStatus());
        assertThat(statusFor(testCase, Member.Role.VICE_PRESIDENT))
                .as("%s / 부회장 회수", permission.key())
                .isEqualTo(testCase.deniedStatus());

        // 모든 직급에서 지워도 회장은 그대로 통과 — 회장은 자기 권한을 뺏을 수 없다.
        assertThat(statusFor(testCase, Member.Role.ADMIN))
                .as("%s / 회장은 항상 통과", permission.key())
                .isEqualTo(testCase.allowedStatus());
    }

    @Test
    void operationsPanelIsReportedThroughMyPermissions() throws Exception {
        // 운영 패널은 백엔드 단일 엔드포인트가 없다 — 화면이 /api/permissions/me 로 읽는다.
        assertThat(myPermissions(Member.Role.OFFICER)).contains(Permission.OPERATIONS_PANEL.key());
        assertThat(myPermissions(Member.Role.USER)).doesNotContain(Permission.OPERATIONS_PANEL.key());

        Map<Member.Role, Set<Permission>> granted = defaults();
        granted.get(Member.Role.USER).add(Permission.OPERATIONS_PANEL);
        granted.get(Member.Role.OFFICER).remove(Permission.OPERATIONS_PANEL);
        putMatrix(granted);

        assertThat(myPermissions(Member.Role.USER)).contains(Permission.OPERATIONS_PANEL.key());
        assertThat(myPermissions(Member.Role.OFFICER)).doesNotContain(Permission.OPERATIONS_PANEL.key());
        // 회장은 매트릭스에서 뭘 지우든 언제나 전 권한.
        String presidentPermissions = myPermissions(Member.Role.ADMIN);
        for (Permission permission : Permission.values()) {
            assertThat(presidentPermissions).contains(permission.key());
        }
    }

    @Test
    void presidentIsNotPartOfTheEditableMatrix() throws Exception {
        mockMvc.perform(get("/api/admin/permissions").cookie(cookies.get(Member.Role.ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.hasItem(Member.Role.ADMIN.name()))))
                .andExpect(jsonPath("$.allowed.ADMIN").doesNotExist())
                .andExpect(jsonPath("$.permissions.length()").value(Permission.values().length));
    }

    @Test
    void adminRoleInTheBodyIsRejected() throws Exception {
        Map<String, List<String>> allowed = matrixBody(defaults());
        allowed.put(Member.Role.ADMIN.name(), List.of(Permission.NOTICE_WRITE.key()));

        mockMvc.perform(put("/api/admin/permissions")
                        .cookie(cookies.get(Member.Role.ADMIN))
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("allowed", allowed))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void onlyPresidentCanReadOrWriteTheMatrix() throws Exception {
        for (Member.Role role : PermissionService.editableRoles()) {
            mockMvc.perform(get("/api/admin/permissions").cookie(cookies.get(role)))
                    .andExpect(status().isForbidden());
            mockMvc.perform(put("/api/admin/permissions")
                            .cookie(cookies.get(role))
                            .header("Origin", ORIGIN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("allowed", matrixBody(defaults())))))
                    .andExpect(status().isForbidden());
        }
        mockMvc.perform(get("/api/admin/permissions")).andExpect(status().isForbidden());
    }

    private int statusFor(Case testCase, Member.Role role) throws Exception {
        return mockMvc.perform(testCase.request().get().cookie(cookies.get(role)))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    private String myPermissions(Member.Role role) throws Exception {
        return mockMvc.perform(get("/api/permissions/me").cookie(cookies.get(role)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    private Map<Member.Role, Set<Permission>> defaults() {
        Map<Member.Role, Set<Permission>> allowed = new EnumMap<>(Member.Role.class);
        for (Member.Role role : PermissionService.editableRoles()) {
            EnumSet<Permission> permissions = EnumSet.noneOf(Permission.class);
            for (Permission permission : Permission.values()) {
                if (permission.defaultRoles().contains(role)) {
                    permissions.add(permission);
                }
            }
            allowed.put(role, permissions);
        }
        return allowed;
    }

    private Map<String, List<String>> matrixBody(Map<Member.Role, Set<Permission>> allowed) {
        Map<String, List<String>> body = new LinkedHashMap<>();
        for (Member.Role role : PermissionService.editableRoles()) {
            body.put(role.name(), allowed.getOrDefault(role, Set.of()).stream().map(Permission::key).toList());
        }
        return body;
    }

    private void putMatrix(Map<Member.Role, Set<Permission>> allowed) throws Exception {
        mockMvc.perform(put("/api/admin/permissions")
                        .cookie(cookies.get(Member.Role.ADMIN))
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("allowed", matrixBody(allowed)))))
                .andExpect(status().isOk());
    }

    private Member member(String studentId, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(role.name());
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        return member;
    }
}
