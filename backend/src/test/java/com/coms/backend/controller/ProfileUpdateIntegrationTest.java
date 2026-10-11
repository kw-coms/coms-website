package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code PATCH /api/auth/profile} with the bodies real clients send. The member app saves the font
 * choice and the profile text from two screens, each sending only its own fields; whatever a
 * request leaves out has to stay as it was. Goes through the HTTP layer on purpose: what matters
 * is the difference between a field that is absent and one that is {@code null}, and only the
 * JSON binding can tell them apart.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:profile-update-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class ProfileUpdateIntegrationTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String STUDENT_ID = "2026000202";

    @Autowired private MockMvc mockMvc;
    @Autowired private MemberRepository memberRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private Cookie cookie;

    @BeforeEach
    void seed() {
        memberRepository.deleteAll();
        Member member = new Member();
        member.setStudentId(STUDENT_ID);
        member.setName("테스트회원");
        member.setEmail(STUDENT_ID + "@example.com");
        member.setPassword("unused");
        member.setRole(Member.Role.USER);
        member.setEmailVerified(true);
        member.setPhone("01012345678");
        member.setAspiration("프로젝트를 만들고 싶습니다.");
        member.setInterests("웹, AI");
        member.setSelectedBuiltinFontKey("b:pretendard");
        memberRepository.save(member);
        cookie = new Cookie("token", jwtTokenProvider.generateToken(STUDENT_ID, 0));
    }

    @Test
    void savingOnlyTheFontKeepsThePhoneInterestsAndAspiration() throws Exception {
        // The member app's settings screen: font fields only.
        send("{\"selectedFontId\":null,\"selectedBuiltinFontKey\":null}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("01012345678"))
                .andExpect(jsonPath("$.interests").value("웹, AI"));

        Member saved = stored();
        assertThat(saved.getSelectedBuiltinFontKey()).isNull();
        assertThat(saved.getPhone()).isEqualTo("01012345678");
        assertThat(saved.getAspiration()).isEqualTo("프로젝트를 만들고 싶습니다.");
        assertThat(saved.getInterests()).isEqualTo("웹, AI");
    }

    @Test
    void savingOnlyTheProfileTextKeepsTheFont() throws Exception {
        // The member app's profile screen: text fields only.
        send("{\"phone\":\"01099998888\",\"interests\":\"보안\",\"aspiration\":\"CTF 참가\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.selectedBuiltinFontKey").value("b:pretendard"));

        Member saved = stored();
        assertThat(saved.getPhone()).isEqualTo("01099998888");
        assertThat(saved.getInterests()).isEqualTo("보안");
        assertThat(saved.getAspiration()).isEqualTo("CTF 참가");
        assertThat(saved.getSelectedBuiltinFontKey()).isEqualTo("b:pretendard");
    }

    @Test
    void theWebsitesFullBodyStillClearsWhatItSendsAsNull() throws Exception {
        send("{\"phone\":null,\"aspiration\":null,\"interests\":\"웹\",\"selectedFontId\":null,\"selectedBuiltinFontKey\":null}")
                .andExpect(status().isOk());

        Member saved = stored();
        assertThat(saved.getPhone()).isNull();
        assertThat(saved.getAspiration()).isNull();
        assertThat(saved.getInterests()).isEqualTo("웹");
        assertThat(saved.getSelectedBuiltinFontKey()).isNull();
    }

    @Test
    void anEmptyBodyChangesNothing() throws Exception {
        send("{}").andExpect(status().isOk());

        Member saved = stored();
        assertThat(saved.getPhone()).isEqualTo("01012345678");
        assertThat(saved.getAspiration()).isEqualTo("프로젝트를 만들고 싶습니다.");
        assertThat(saved.getInterests()).isEqualTo("웹, AI");
        assertThat(saved.getSelectedBuiltinFontKey()).isEqualTo("b:pretendard");
    }

    @Test
    void validationStillAppliesToWhatIsSent() throws Exception {
        send("{\"phone\":\"" + "0".repeat(21) + "\"}").andExpect(status().isBadRequest());
        send("{\"selectedFontId\":1,\"selectedBuiltinFontKey\":\"b:pretendard\"}").andExpect(status().isBadRequest());

        assertThat(stored().getPhone()).isEqualTo("01012345678");
    }

    private ResultActions send(String body) throws Exception {
        return mockMvc.perform(patch("/api/auth/profile")
                .cookie(cookie)
                .header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private Member stored() {
        return memberRepository.findByStudentId(STUDENT_ID).orElseThrow();
    }
}
