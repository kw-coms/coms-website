package com.coms.backend.controller;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.ArchiveService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:archive-visibility-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/archive-visibility"
})
@AutoConfigureMockMvc
@Transactional
class ArchiveVisibilityIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ArchiveService archiveService;
    @Autowired ArchiveFileRepository files;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;
    private final ObjectMapper json = new ObjectMapper();

    private final Map<Member.Role, String> ids = new EnumMap<>(Member.Role.class);
    private Long publicId, membersId, officersId, selectedId, attachmentId;
    private String chosenId, uploaderId;

    @BeforeEach
    void setUp() throws Exception {
        int number = 1;
        for (Member.Role role : Member.Role.values()) {
            String id = String.format("20261100%02d", number++);
            ids.put(role, id);
            saveMember(id, role);
        }
        chosenId = "2026110010";
        uploaderId = "2026110011";
        saveMember(chosenId, Member.Role.USER);
        saveMember(uploaderId, Member.Role.USER);
        publicId = upload("public", ArchiveFile.Visibility.PUBLIC, ids.get(Member.Role.ADMIN), Set.of());
        membersId = upload("members", ArchiveFile.Visibility.MEMBERS, ids.get(Member.Role.ADMIN), Set.of());
        officersId = upload("officers", ArchiveFile.Visibility.OFFICERS, ids.get(Member.Role.ADMIN), Set.of());
        selectedId = upload("selected", ArchiveFile.Visibility.SELECTED, uploaderId, Set.of(chosenId));
        attachmentId = archiveService.list(ids.get(Member.Role.ADMIN)).stream()
                .filter(file -> file.id().equals(selectedId)).findFirst().orElseThrow().attachments().get(0).id();
    }

    @Test
    void everyArchiveReadUsesTheSameVisibilityMatrix() throws Exception {
        record Viewer(String id, Set<ArchiveFile.Visibility> visible) {}
        List<Viewer> viewers = List.of(
                new Viewer(null, Set.of(ArchiveFile.Visibility.PUBLIC)),
                new Viewer(ids.get(Member.Role.ASSOCIATE), Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS)),
                new Viewer(ids.get(Member.Role.USER), Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS)),
                new Viewer(ids.get(Member.Role.OFFICER), Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS, ArchiveFile.Visibility.OFFICERS)),
                new Viewer(ids.get(Member.Role.VICE_PRESIDENT), Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS, ArchiveFile.Visibility.OFFICERS)),
                new Viewer(chosenId, Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS, ArchiveFile.Visibility.SELECTED)),
                new Viewer(uploaderId, Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS, ArchiveFile.Visibility.SELECTED)),
                new Viewer(ids.get(Member.Role.ADMIN), Set.of(ArchiveFile.Visibility.values()))
        );
        Map<ArchiveFile.Visibility, Long> rows = Map.of(
                ArchiveFile.Visibility.PUBLIC, publicId,
                ArchiveFile.Visibility.MEMBERS, membersId,
                ArchiveFile.Visibility.OFFICERS, officersId,
                ArchiveFile.Visibility.SELECTED, selectedId
        );
        Map<Long, Long> attachmentIds = archiveService.list(ids.get(Member.Role.ADMIN)).stream()
                .collect(java.util.stream.Collectors.toMap(file -> file.id(), file -> file.attachments().get(0).id()));
        for (Viewer viewer : viewers) {
            JsonNode list = body(get("/api/files"), viewer.id());
            for (var entry : rows.entrySet()) {
                boolean allowed = viewer.visible().contains(entry.getKey());
                assertThat(list.toString().contains("\"id\":" + entry.getValue() + ","))
                        .as("list %s %s", viewer.id(), entry.getKey()).isEqualTo(allowed);
                for (String path : List.of("/api/files/%d", "/api/files/%d/download", "/api/files/%d/inline",
                        "/api/files/%d/attachments/" + attachmentIds.get(entry.getValue()) + "/download")) {
                    assertThat(status(get(path.formatted(entry.getValue())), viewer.id()))
                            .as("%s %s %s", viewer.id(), entry.getKey(), path)
                            .isEqualTo(allowed ? 200 : 404);
                }
            }
            if (viewer.id() != null) {
                JsonNode mobile = body(get("/api/mobile/v1/home"), viewer.id());
                for (var entry : rows.entrySet()) {
                    assertThat(mobile.path("quickFiles").toString().contains("\"id\":" + entry.getValue() + ","))
                            .as("mobile %s %s", viewer.id(), entry.getKey())
                            .isEqualTo(viewer.visible().contains(entry.getKey()));
                    assertThat(status(post("/api/files/%d/vote".formatted(entry.getValue()))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"value\":1}"), viewer.id()))
                            .as("vote %s %s", viewer.id(), entry.getKey())
                            .isEqualTo(viewer.visible().contains(entry.getKey()) ? 200 : 404);
                }
            } else {
                assertThat(status(get("/api/mobile/v1/home"), null)).isEqualTo(401);
                for (Long id : rows.values()) {
                    assertThat(status(post("/api/files/%d/vote".formatted(id))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"value\":1}"), null)).isEqualTo(401);
                }
            }
        }
    }

    @Test
    void uploaderCanSelectBasicVisibilityButRestrictedSelectionNeedsGrant() throws Exception {
        assertThat(body(get("/api/files/" + selectedId), chosenId).path("selectedStudentIds").size()).isZero();
        assertThat(body(get("/api/files/" + selectedId), ids.get(Member.Role.ADMIN))
                .path("selectedStudentIds").get(0).asText()).isEqualTo(chosenId);
        int memberDefault = status(patch("/api/files/%d/visibility".formatted(membersId))
                .contentType(MediaType.APPLICATION_JSON).content("{\"visibility\":\"PUBLIC\"}"), uploaderId);
        assertThat(memberDefault).isEqualTo(403);
        assertThat(status(patch("/api/files/%d/visibility".formatted(selectedId))
                .contentType(MediaType.APPLICATION_JSON).content("{\"visibility\":\"PUBLIC\"}"), uploaderId)).isEqualTo(200);
        assertThat(status(patch("/api/files/%d/visibility".formatted(selectedId))
                .contentType(MediaType.APPLICATION_JSON).content("{\"visibility\":\"SELECTED\",\"selectedStudentIds\":[\"" + chosenId + "\"]}"), uploaderId)).isEqualTo(403);
        assertThat(status(get("/api/files/visibility-members?query=2026"), uploaderId)).isEqualTo(403);
        assertThat(status(get("/api/files/visibility-members?query=2026"), ids.get(Member.Role.ADMIN))).isEqualTo(200);
    }

    private Long upload(String title, ArchiveFile.Visibility visibility, String uploader, Set<String> selected) throws Exception {
        var response = archiveService.uploadGroup(title, null, "GENERAL",
                List.of(new MockMultipartFile("files", title + ".pdf", "application/pdf", "%PDF-1.4".getBytes())),
                ids.get(Member.Role.ADMIN));
        ArchiveFile row = files.findById(response.id()).orElseThrow();
        row.setUploadedBy(uploader);
        row.setVisibility(visibility);
        row.setSelectedStudentIds(selected);
        files.saveAndFlush(row);
        return row.getId();
    }

    private void saveMember(String id, Member.Role role) {
        Member member = new Member();
        member.setStudentId(id);
        member.setName("Member " + id);
        member.setEmail(id + "@example.com");
        member.setPassword("encoded");
        member.setEmailVerified(true);
        member.setRole(role);
        members.save(member);
    }

    private int status(MockHttpServletRequestBuilder request, String id) throws Exception {
        if (id != null) request.cookie(new Cookie("token", tokens.generateToken(id, 0)));
        request.header("Origin", "http://localhost:5173");
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    private JsonNode body(MockHttpServletRequestBuilder request, String id) throws Exception {
        if (id != null) request.cookie(new Cookie("token", tokens.generateToken(id, 0)));
        var response = mvc.perform(request).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        return json.readTree(response.getContentAsString());
    }
}
