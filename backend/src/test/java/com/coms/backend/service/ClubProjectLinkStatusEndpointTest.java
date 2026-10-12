package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.repository.ClubProjectRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The catalogue link status through the real filter chain: anyone may read it, like the
 * catalogue itself, and it carries what the last look found. The fetch is a stand-in, so no
 * request leaves the machine. In the same package as the service to reach its fetch.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:club-project-link-status-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/club-project-link-status"
})
@AutoConfigureMockMvc
@Transactional
class ClubProjectLinkStatusEndpointTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ClubProjectRepository repository;
    @Autowired
    private ClubProjectLinkStatusService service;
    @Autowired
    private ApplicationContext context;
    @MockitoBean
    private LinkPreviewService linkPreviewService;

    @Test
    void anyoneReadsWhatTheLastLookFound() throws Exception {
        // Before any look there is nothing to say, and that is not an error.
        mockMvc.perform(get("/api/club-projects/link-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        repository.deleteAll();
        ClubProject up = repository.save(project("열리는 앱", "https://up.example/app/"));
        ClubProject down = repository.save(project("죽은 앱", "http://down.example/"));
        ClubProject silent = repository.save(project("대답 없는 앱", "https://silent.example/"));
        repository.save(project("링크 없는 항목", null));
        doReturn(200).when(linkPreviewService).finalStatus(anyString());
        // The http link is asked in its https form.
        doReturn(502).when(linkPreviewService).finalStatus("https://down.example/");
        doThrow(new IOException("timed out")).when(linkPreviewService).finalStatus("https://silent.example/");

        service.checkAll();

        mockMvc.perform(get("/api/club-projects/link-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].projectId").value(up.getId()))
                .andExpect(jsonPath("$[0].linkUrl").value("https://up.example/app/"))
                .andExpect(jsonPath("$[0].state").value("UP"))
                .andExpect(jsonPath("$[0].checkedAt").exists())
                .andExpect(jsonPath("$[1].projectId").value(down.getId()))
                .andExpect(jsonPath("$[1].linkUrl").value("http://down.example/"))
                .andExpect(jsonPath("$[1].state").value("DOWN"))
                .andExpect(jsonPath("$[2].projectId").value(silent.getId()))
                .andExpect(jsonPath("$[2].state").value("DOWN"));
    }

    @Test
    void theTimerIsOffUnlessItIsSwitchedOn() {
        // Tests and a developer's machine make no requests to the outside: only the prod
        // profile turns the scheduled look on.
        assertThat(context.getBeansOfType(ClubProjectLinkStatusJob.class)).isEmpty();
    }

    private static ClubProject project(String title, String linkUrl) {
        ClubProject project = new ClubProject();
        project.setCategory("WEBSITE");
        project.setTitle(title);
        project.setLinkUrl(linkUrl);
        return project;
    }
}
