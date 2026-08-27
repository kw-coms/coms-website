package com.coms.backend.service;

import com.coms.backend.domain.SiteSettings;
import com.coms.backend.dto.SiteSettingsRequest;
import com.coms.backend.dto.SiteSettingsResponse;
import com.coms.backend.repository.SiteSettingsRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class SiteSettingsService {
    private static final Long SINGLETON_ID = 1L;
    private static final TypeReference<List<SiteSettingsResponse.ContactLink>> CONTACT_LINKS_TYPE = new TypeReference<>() {};
    private static final List<SiteSettingsResponse.ContactLink> DEFAULT_CONTACT_LINKS = List.of(
            new SiteSettingsResponse.ContactLink("Mail", "mailto:kwcoms69@gmail.com")
    );

    private final SiteSettingsRepository siteSettingsRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SiteSettingsService(SiteSettingsRepository siteSettingsRepository) {
        this.siteSettingsRepository = siteSettingsRepository;
    }

    public SiteSettingsResponse current() {
        return toResponse(siteSettingsRepository.findById(SINGLETON_ID).orElseGet(this::createDefaults));
    }

    public String clubRoomCode() {
        return siteSettingsRepository.findById(SINGLETON_ID).orElseGet(this::createDefaults).getClubRoomCode();
    }

    public String updateClubRoomCode(String doorCode) {
        SiteSettings settings = siteSettingsRepository.findById(SINGLETON_ID).orElseGet(this::createDefaults);
        settings.setClubRoomCode(doorCode == null ? "" : doorCode.trim());
        return siteSettingsRepository.save(settings).getClubRoomCode();
    }

    public SiteSettingsResponse publish(SiteSettingsRequest request) {
        SiteSettings settings = siteSettingsRepository.findById(SINGLETON_ID).orElseGet(this::createDefaults);
        settings.setSemesterLabel(required(request.semesterLabel(), "Semester label is required."));
        settings.setRecruitmentStatus(required(request.recruitmentStatus(), "Recruitment status is required."));
        settings.setRecruitmentPeriod(required(request.recruitmentPeriod(), "Recruitment period is required."));
        settings.setHomeHeroTitle(required(request.homeHeroTitle(), "Home hero title is required."));
        settings.setHomeHeroCopy(required(request.homeHeroCopy(), "Home hero copy is required."));
        settings.setContactLinksJson(writeContactLinks(normalizeContactLinks(request.contactLinks())));
        return toResponse(siteSettingsRepository.save(settings));
    }

    private SiteSettings createDefaults() {
        SiteSettings settings = new SiteSettings();
        settings.setId(SINGLETON_ID);
        settings.setSemesterLabel("2026 Semester Ready");
        settings.setRecruitmentStatus("모집 안내");
        settings.setRecruitmentPeriod("상세 일정은 COM's 공식 채널과 학내 공지를 통해 안내됩니다.");
        settings.setHomeHeroTitle("COM's");
        settings.setHomeHeroCopy("배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.");
        settings.setContactLinksJson(writeContactLinks(DEFAULT_CONTACT_LINKS));
        return siteSettingsRepository.save(settings);
    }

    private SiteSettingsResponse toResponse(SiteSettings settings) {
        return new SiteSettingsResponse(
                settings.getId(),
                settings.getSemesterLabel(),
                settings.getRecruitmentStatus(),
                settings.getRecruitmentPeriod(),
                settings.getHomeHeroTitle(),
                settings.getHomeHeroCopy(),
                readContactLinks(settings.getContactLinksJson()),
                settings.getCreatedAt(),
                settings.getUpdatedAt()
        );
    }

    private List<SiteSettingsResponse.ContactLink> normalizeContactLinks(List<SiteSettingsRequest.ContactLinkRequest> links) {
        List<SiteSettingsResponse.ContactLink> normalized = (links == null ? List.<SiteSettingsRequest.ContactLinkRequest>of() : links)
                .stream()
                .map(link -> new SiteSettingsResponse.ContactLink(
                        required(link.label(), "Contact label is required."),
                        validatedContactHref(link.href())
                ))
                .toList();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one contact link is required.");
        }
        return normalized;
    }

    private String validatedContactHref(String value) {
        String href = required(value, "Contact link is required.");
        if (href.chars().anyMatch(Character::isISOControl)) {
            throw invalidContactLink();
        }
        try {
            URI uri = new URI(href);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if ("mailto".equals(scheme)) {
                if (uri.getRawSchemeSpecificPart() == null || uri.getRawSchemeSpecificPart().isBlank()) {
                    throw invalidContactLink();
                }
                return href;
            }
            if (("http".equals(scheme) || "https".equals(scheme))
                    && uri.getHost() != null
                    && !uri.getHost().isBlank()
                    && uri.getUserInfo() == null) {
                return href;
            }
        } catch (URISyntaxException ignored) {
            // Converted to the same stable client-facing validation response below.
        }
        throw invalidContactLink();
    }

    private ResponseStatusException invalidContactLink() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Contact link must be a safe http, https, or mailto URI.");
    }

    private List<SiteSettingsResponse.ContactLink> readContactLinks(String json) {
        try {
            List<SiteSettingsResponse.ContactLink> links = objectMapper.readValue(json, CONTACT_LINKS_TYPE);
            return links == null || links.isEmpty() ? DEFAULT_CONTACT_LINKS : links;
        } catch (Exception e) {
            return DEFAULT_CONTACT_LINKS;
        }
    }

    private String writeContactLinks(List<SiteSettingsResponse.ContactLink> links) {
        try {
            return objectMapper.writeValueAsString(links);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not serialize contact links.");
        }
    }

    private String required(String value, String message) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return trimmed;
    }
}
