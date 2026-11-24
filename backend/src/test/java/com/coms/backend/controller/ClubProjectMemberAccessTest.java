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
        return member(id, Member.Role.USER);
    }

    private Cookie member(String id, Member.Role role) {
        Member m = new Member();
        m.setStudentId(id);
        m.setName("회원 " + id);
        m.setEmail(id + "@example.invalid");
        m.setPassword("unused");
        m.setRole(role);
        m.setEmailVerified(true);
        members.save(m);
        return new Cookie("token", tokens.generateToken(id, 0));
    }

    @Test
    void memberCanEditOwnWorkAndImagesButNotAnotherMembers() throws Exception {
        Cookie owner = member("2099000011");
        Cookie other = member("2099000012");
        Cookie manager = member("2099000013", Member.Role.ADMIN);
        long id = ((Number) JsonPath.read(mvc.perform(post("/api/club-projects")
                .cookie(owner).header("Origin", ORIGIN).param("category", "APP").param("title", "내 작품")
                .param("madeBy", "남의 이름").param("position", "-999"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.madeBy").value("남의 이름"))
                .andExpect(jsonPath("$.canEdit").value(true))
                .andExpect(jsonPath("$.reviewStatus").value("PENDING"))
                .andReturn().getResponse().getContentAsString(), "$.id")).longValue();

        mvc.perform(get("/api/club-projects").cookie(owner).header("Origin", ORIGIN))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].canEdit").value(true));
        mvc.perform(get("/api/club-projects").header("Origin", ORIGIN))
                .andExpect(jsonPath("$[?(@.id == " + id + ")]").isEmpty());
        mvc.perform(get("/api/club-projects").cookie(other).header("Origin", ORIGIN))
                .andExpect(jsonPath("$[?(@.id == " + id + ")]").isEmpty());
        mvc.perform(get("/api/club-projects/{id}", id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/club-projects/{id}/comments", id)).andExpect(status().isNotFound());
        mvc.perform(patch("/api/club-projects/{id}/review", id).cookie(owner)
                .header("Origin", ORIGIN).param("status", "APPROVED"))
                .andExpect(status().isForbidden());
        byte[] png = Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=");
        MockMultipartFile image = new MockMultipartFile("images", "cover.png", "image/png", png);
        int pendingImageId = ((Number) JsonPath.read(mvc.perform(multipart("/api/club-projects/{id}/images", id)
                .file(image).cookie(owner).header("Origin", ORIGIN)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$[0]")).intValue();
        mvc.perform(get("/api/club-projects/{id}/images/{imageId}", id, pendingImageId))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/club-projects/{id}/images/{imageId}", id, pendingImageId).cookie(owner))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/club-projects/{id}/review", id).cookie(manager)
                .header("Origin", ORIGIN).param("status", "APPROVED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reviewStatus").value("APPROVED"));
        mvc.perform(get("/api/club-projects/{id}/images/{imageId}", id, pendingImageId))
                .andExpect(status().isOk());
        mvc.perform(get("/api/club-projects").cookie(other).header("Origin", ORIGIN))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].canEdit").value(false));
        mvc.perform(patch("/api/club-projects/{id}", id).cookie(other).header("Origin", ORIGIN).param("title", "탈취"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/club-projects/{id}", id).cookie(other).header("Origin", ORIGIN).param("madeBy", "명의 변경"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/club-projects/{id}", id).cookie(owner).header("Origin", ORIGIN).param("madeBy", "공동 제작자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.madeBy").value("공동 제작자"));
        mvc.perform(delete("/api/club-projects/{id}", id).cookie(other).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());

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

        mvc.perform(patch("/api/club-projects/{id}", id).cookie(owner).header("Origin", ORIGIN)
                .param("linkUrl", "https://new.example.com"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reviewStatus").value("PENDING"));
        mvc.perform(get("/api/club-projects/{id}", id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/club-projects/{id}", id).cookie(owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reviewStatus").value("PENDING"));
        mvc.perform(patch("/api/club-projects/{id}/review", id).cookie(manager)
                .header("Origin", ORIGIN).param("status", "REJECTED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reviewStatus").value("REJECTED"));
        mvc.perform(get("/api/club-projects/{id}", id)).andExpect(status().isNotFound());
        mvc.perform(patch("/api/club-projects/{id}", id).cookie(owner).header("Origin", ORIGIN)
                .param("description", "수정한 설명"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reviewStatus").value("PENDING"));
    }
}
