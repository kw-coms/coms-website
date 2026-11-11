package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Base64;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:club-project-access-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/club-project-access"
})
@AutoConfigureMockMvc
@Transactional
class ClubProjectMemberAccessTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    @Autowired MockMvc mvc;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;

    private Cookie member(String id) {
        Member m = new Member();
        m.setStudentId(id);
        m.setName("회원 " + id);
        m.setEmail(id + "@example.invalid");
        m.setPassword("unused");
        m.setRole(Member.Role.USER);
        m.setEmailVerified(true);
        members.save(m);
        return new Cookie("token", tokens.generateToken(id, 0));
    }

    @Test
    void memberCanEditOwnWorkAndImagesButNotAnotherMembers() throws Exception {
        Cookie owner = member("2099000011");
        Cookie other = member("2099000012");
        long id = ((Number) JsonPath.read(mvc.perform(post("/api/club-projects")
                .cookie(owner).header("Origin", ORIGIN).param("category", "APP").param("title", "내 작품")
                .param("madeBy", "남의 이름").param("position", "-999"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.madeBy").value("회원 2099000011"))
                .andExpect(jsonPath("$.canEdit").value(true))
                .andReturn().getResponse().getContentAsString(), "$.id")).longValue();

        mvc.perform(get("/api/club-projects").cookie(owner).header("Origin", ORIGIN))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].canEdit").value(true));
        mvc.perform(get("/api/club-projects").cookie(other).header("Origin", ORIGIN))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].canEdit").value(false));
        mvc.perform(patch("/api/club-projects/{id}", id).cookie(other).header("Origin", ORIGIN).param("title", "탈취"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/club-projects/{id}", id).cookie(other).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());

        byte[] png = Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=");
        MockMultipartFile image = new MockMultipartFile("images", "cover.png", "image/png", png);
        mvc.perform(multipart("/api/club-projects/{id}/images", id).file(image).cookie(other).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        int imageId = ((Number) JsonPath.read(mvc.perform(multipart("/api/club-projects/{id}/images", id)
                .file(image).cookie(owner).header("Origin", ORIGIN)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$[0]")).intValue();
        mvc.perform(get("/api/club-projects/{id}/images/{imageId}", id, imageId))
                .andExpect(status().isOk()).andExpect(header().string("X-Content-Type-Options", "nosniff"));
        mvc.perform(delete("/api/club-projects/{id}/images/{imageId}", id, imageId).cookie(other).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/club-projects/{id}/images/{imageId}", id, imageId).cookie(owner).header("Origin", ORIGIN))
                .andExpect(status().isNoContent());
    }
}
