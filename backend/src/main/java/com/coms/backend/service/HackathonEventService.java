package com.coms.backend.service;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonEventStatus;
import com.coms.backend.domain.HackathonMaterial;
import com.coms.backend.domain.HackathonProject;
import com.coms.backend.dto.AdminHackathonEventResponse;
import com.coms.backend.dto.AdminHackathonEventSummary;
import com.coms.backend.dto.HackathonEventResponse;
import com.coms.backend.dto.HackathonEventSummary;
import com.coms.backend.dto.HackathonEventWrite;
import com.coms.backend.dto.HackathonMaterialResponse;
import com.coms.backend.dto.HackathonProjectResponse;
import com.coms.backend.dto.HackathonResultResponse;
import com.coms.backend.dto.HackathonProjectWrite;
import com.coms.backend.dto.HackathonTeamWork;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.HackathonEventRepository;
import com.coms.backend.repository.HackathonMaterialRepository;
import com.coms.backend.repository.HackathonProjectRepository;
import com.coms.backend.repository.HackathonReviewRepository;
import com.coms.backend.web.SafeMediaTypes;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class HackathonEventService {
    private static final Set<String> KINDS = Set.of("proposal", "presentation", "video", "poster", "other");
    private static final Set<String> LEGACY_URLS = Set.of(
            "/hackathon-2026/opening.pptx",
            "/hackathon-2026/wargether/proposal.pdf", "/hackathon-2026/wargether/presentation.pdf",
            "/hackathon-2026/wargether/demo.mp4", "/hackathon-2026/wargether/poster.jpg",
            "/hackathon-2026/underground-route/proposal.pdf", "/hackathon-2026/underground-route/presentation.pdf",
            "/hackathon-2026/underground-route/demo.mp4", "/hackathon-2026/underground-route/poster.jpg",
            "/hackathon-2026/still/proposal.pdf", "/hackathon-2026/still/presentation.pptx",
            "/hackathon-2026/still/demo.mp4", "/hackathon-2026/still/poster.jpg");

    private final HackathonEventRepository events;
    private final HackathonProjectRepository projects;
    private final HackathonMaterialRepository materials;
    private final HackathonReviewRepository reviews;
    private final MediaUploadValidator validator;
    private final StorageService storage;
    private final Clock clock;
    private final MemberRepository members;

    public HackathonEventService(HackathonEventRepository events, HackathonProjectRepository projects,
                                 HackathonMaterialRepository materials, HackathonReviewRepository reviews,
                                 MediaUploadValidator validator, StorageService storage, Clock clock, MemberRepository members) {
        this.events = events;
        this.projects = projects;
        this.materials = materials;
        this.reviews = reviews;
        this.validator = validator;
        this.storage = storage;
        this.clock = clock;
        this.members = members;
    }

    @Transactional(readOnly = true)
    public List<HackathonEventSummary> publicList() {
        return events.findByPublishedTrueOrderByYearDescSemesterDescIdDesc().stream()
                .map(event -> HackathonEventSummary.from(event, status(event), (int) projects.countByEventIdAndPublishedTrue(event.getId()))).toList();
    }

    @Transactional(readOnly = true)
    public HackathonEventResponse publicDetail(Long id) {
        HackathonEvent event = requirePublic(id);
        HackathonEventStatus status = status(event);
        List<HackathonProject> eventProjects = projects.findByEventIdAndPublishedTrueOrderByPositionAscIdAsc(id);
        // 점수는 완료 + 결과 공개일 때만 내려간다. 평가자 이름·의견은 어떤 경우에도 내려가지 않는다.
        List<HackathonResultResponse> results = event.isResultsPublished() && status == HackathonEventStatus.DONE
                ? HackathonRanking.rank(eventProjects, reviews.findByEventIdOrderByCreatedAtAscIdAsc(id)) : List.of();
        return HackathonEventResponse.from(event, eventProjects, materials.findByEventIdOrderByIdAsc(id), status, results);
    }

    @Transactional(readOnly = true)
    public List<AdminHackathonEventSummary> adminList() {
        return events.findAllByOrderByYearDescSemesterDescIdDesc().stream().map(event -> AdminHackathonEventSummary.from(event, status(event))).toList();
    }

    @Transactional(readOnly = true)
    public AdminHackathonEventResponse adminDetail(Long id) {
        HackathonEvent event = requireEvent(id);
        return AdminHackathonEventResponse.from(event, projects.findByEventIdOrderByPositionAscIdAsc(id), materials.findByEventIdOrderByIdAsc(id), status(event));
    }

    @Transactional
    public AdminHackathonEventResponse create(HackathonEventWrite write) {
        HackathonEvent event = new HackathonEvent();
        copyEvent(event, write);
        return adminDetail(events.saveAndFlush(event).getId());
    }

    @Transactional
    public AdminHackathonEventResponse update(Long id, HackathonEventWrite write) {
        HackathonEvent event = lock(id);
        copyEvent(event, write);
        // 종료 시각을 미래로 옮기는 등 완료가 아니게 되면 공개된 결과를 거둔다.
        if (event.isResultsPublished() && status(event) != HackathonEventStatus.DONE) event.setResultsPublished(false);
        return adminDetail(events.saveAndFlush(event).getId());
    }

    @Transactional
    public boolean publish(Long id, Boolean published) {
        if (published == null) throw invalid();
        HackathonEvent event = lock(id);
        if (!published && (event.isOpen() || reviews.existsByEventId(id))) throw conflict("평가 중이거나 평가가 있는 행사는 숨길 수 없습니다.");
        event.setPublished(published);
        events.saveAndFlush(event);
        return published;
    }

    @Transactional
    public boolean setOpen(Long id, Boolean open) {
        if (open == null) throw invalid();
        HackathonEvent event = lock(id);
        if (open && (!event.isPublished() || projects.countByEventIdAndPublishedTrue(id) == 0)) throw conflict("공개된 행사에 작품이 있어야 평가를 열 수 있습니다.");
        event.setOpen(open);
        if (open) event.setResultsPublished(false);
        events.saveAndFlush(event);
        return open;
    }

    @Transactional
    public boolean setResultsPublished(Long id, Boolean resultsPublished) {
        if (resultsPublished == null) throw invalid();
        HackathonEvent event = lock(id);
        if (resultsPublished && (!event.isPublished() || status(event) != HackathonEventStatus.DONE))
            throw conflict("완료된 행사만 결과를 공개할 수 있습니다. 평가를 닫고 개발 기간이 끝난 뒤에 공개해 주세요.");
        if (resultsPublished && HackathonRanking.rank(projects.findByEventIdAndPublishedTrueOrderByPositionAscIdAsc(id),
                reviews.findByEventIdOrderByCreatedAtAscIdAsc(id)).isEmpty())
            throw conflict("모든 팀에 졸업생 평가와 회장 평가가 있어야 결과를 공개할 수 있습니다.");
        event.setResultsPublished(resultsPublished);
        events.saveAndFlush(event);
        return resultsPublished;
    }

    private HackathonEventStatus status(HackathonEvent event) {
        return HackathonEventStatus.of(event, LocalDateTime.now(clock.withZone(ZoneId.of("Asia/Seoul"))),
                reviews.existsByEventId(event.getId()));
    }

    @Transactional
    public HackathonProjectResponse createProject(Long eventId, HackathonProjectWrite write) {
        HackathonEvent event = lock(eventId);
        requireMutable(event);
        if (projects.countByEventId(eventId) >= 100) throw conflict("작품은 행사당 100개까지 등록할 수 있습니다.");
        HackathonProject project = new HackathonProject();
        project.setId(UUID.randomUUID().toString());
        project.setEventId(eventId);
        copyProject(project, write, true);
        return HackathonProjectResponse.from(projects.saveAndFlush(project), List.of());
    }

    @Transactional
    public HackathonProjectResponse updateProject(Long eventId, String projectId, HackathonProjectWrite write) {
        HackathonEvent event = lock(eventId);
        HackathonProject project = requireProject(eventId, projectId);
        if (write != null && write.published() != null && write.published() != project.isPublished()) requireMutable(event);
        if (write != null && write.version() != null) requireVersion(project, write.version());
        copyProject(project, write, false);
        projects.saveAndFlush(project);
        return HackathonProjectResponse.from(project, materials.findByEventIdOrderByIdAsc(eventId));
    }

    @Transactional(readOnly = true)
    public List<Long> projectMembers(Long eventId, String projectId) {
        return requireProject(eventId, projectId).getMemberIds().stream().sorted().toList();
    }

    @Transactional(readOnly = true)
    public HackathonTeamWork teamWork(Long eventId, String studentId) {
        HackathonEvent event = requirePublic(eventId);
        List<HackathonProjectResponse> work = projects.findForMember(eventId, memberId(studentId)).stream()
                .map(project -> HackathonProjectResponse.from(project, List.of())).toList();
        return new HackathonTeamWork(isMutable(event), work);
    }

    @Transactional
    public HackathonProjectResponse saveTeamWork(Long eventId, String projectId, String studentId, HackathonTeamWork.Write write) {
        HackathonEvent event = lock(eventId);
        if (!event.isPublished()) throw notFound();
        HackathonProject project = requireProject(eventId, projectId);
        if (!project.getMemberIds().contains(memberId(studentId))) throw notFound();
        requireMutable(event);
        if (write == null) throw invalid();
        requireVersion(project, write.version());
        copyWork(project, write.title(), write.author(), write.description(), write.github(), write.live());
        return HackathonProjectResponse.from(projects.saveAndFlush(project), List.of());
    }

    private Long memberId(String studentId) {
        return members.findByStudentId(studentId).orElseThrow(HackathonEventService::notFound).getId();
    }

    private static void requireVersion(HackathonProject project, Long version) {
        if (version == null || project.getVersion() != version)
            throw conflict("다른 사람이 먼저 저장했습니다. 작성한 내용을 복사한 뒤 페이지를 새로고침해 주세요.");
    }

    @Transactional
    public void deleteProject(Long eventId, String projectId) {
        HackathonEvent event = lock(eventId);
        requireMutable(event);
        HackathonProject project = requireProject(eventId, projectId);
        if (materials.countByEventIdAndProjectId(eventId, projectId) > 0) throw conflict("자료가 있는 작품은 먼저 자료를 정리해 주세요.");
        projects.delete(project);
    }

    @Transactional
    public HackathonMaterialResponse upload(Long eventId, String projectId, String kind, String label, MultipartFile file) {
        HackathonEvent event = lock(eventId);
        requireMutable(event);
        if (projectId != null) requireProject(eventId, projectId);
        long count = projectId == null ? materials.countByEventIdAndProjectIdIsNull(eventId)
                : materials.countByEventIdAndProjectId(eventId, projectId);
        if (count >= 20) throw conflict("자료는 행사 또는 작품당 20개까지 등록할 수 있습니다.");
        if (kind == null || !KINDS.contains(kind)) throw invalid();
        String cleanLabel = text(label, 120, false);
        String filename = MediaUploadValidator.cleanOriginalFilename(file);
        if (filename.isBlank() || filename.length() > 255) throw invalid();
        String extension = StringUtils.getFilenameExtension(filename);
        if (extension == null) throw invalid();
        extension = extension.toLowerCase(Locale.ROOT);
        String type;
        String expectedMedia = mediaTypeFor(extension);
        if (expectedMedia != null && expectedMedia.startsWith("image/")) {
            type = validator.validateImageContent(file, expectedMedia);
        } else if (expectedMedia != null) {
            type = validator.validateVideoContent(file, expectedMedia);
        } else {
            validator.validateFile(file);
            if (Set.of("pptx", "docx", "xlsx", "hwpx").contains(extension)
                    && !UploadSniffer.isZip(UploadSniffer.header(file))) throw invalid();
            type = switch (extension) {
                case "pdf" -> "application/pdf";
                case "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
                case "ppt" -> "application/vnd.ms-powerpoint";
                case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                case "doc" -> "application/msword";
                case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                case "xls" -> "application/vnd.ms-excel";
                case "zip" -> "application/zip";
                default -> "application/octet-stream";
            };
        }
        String stored;
        try {
            stored = type.startsWith("image/") ? storage.storeImage(file, type, MediaUploadValidator.canonicalExtension(type))
                    : storage.store(file, type.startsWith("video/") ? MediaUploadValidator.canonicalExtension(type) : extension);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "파일을 저장하지 못했습니다.", ex);
        }
        try {
            HackathonMaterial material = new HackathonMaterial();
            material.setEventId(eventId);
            material.setProjectId(projectId);
            material.setKind(kind);
            material.setLabel(cleanLabel);
            material.setOriginalName(filename);
            material.setMimeType(type);
            material.setFileSize(file.getSize());
            material.setStoredName(stored);
            materials.saveAndFlush(material);
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCompletion(int status) {
                        if (status != STATUS_COMMITTED) storage.delete(stored);
                    }
                });
            }
            return HackathonMaterialResponse.from(material);
        } catch (RuntimeException ex) {
            storage.delete(stored);
            throw ex;
        }
    }

    @Transactional
    public void deleteMaterial(Long eventId, Long materialId) {
        HackathonEvent event = lock(eventId);
        requireMutable(event);
        HackathonMaterial material = requireMaterial(eventId, materialId);
        materials.delete(material);
        if (material.getStoredName() != null) {
            String stored = material.getStoredName();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { storage.delete(stored); }
            });
        }
    }

    @Transactional(readOnly = true)
    public ResponseEntity<Resource> download(Long eventId, Long materialId, boolean pdfOnly) {
        HackathonMaterial material = requirePublicMaterial(eventId, materialId);
        boolean pdf = "application/pdf".equals(material.getMimeType()) && material.getOriginalName().toLowerCase(Locale.ROOT).endsWith(".pdf");
        if (pdfOnly && !pdf) throw notFound();
        if (material.getLegacyUrl() != null) {
            if (!LEGACY_URLS.contains(material.getLegacyUrl())) throw notFound();
            return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, material.getLegacyUrl())
                    .header(HttpHeaders.CACHE_CONTROL, "no-store").build();
        }
        Resource resource = storage.load(material.getStoredName());
        if (pdfOnly && !verifiedPdf(resource)) throw notFound();
        MediaType type = pdfOnly ? MediaType.APPLICATION_PDF : SafeMediaTypes.forDownload(material.getMimeType());
        boolean inline = pdfOnly || type.getType().equals("image") || type.getType().equals("video");
        ContentDisposition disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(material.getOriginalName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().contentType(type).header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").body(resource);
    }

    private boolean verifiedPdf(Resource resource) {
        try (var in = resource.getInputStream()) {
            return new String(in.readNBytes(4), StandardCharsets.US_ASCII).equals("%PDF");
        } catch (IOException ex) {
            return false;
        }
    }

    private static String mediaTypeFor(String extension) {
        return switch (extension) {
            case "jpg", "jpeg" -> "image/jpeg";
            case "png" -> "image/png";
            case "gif" -> "image/gif";
            case "webp" -> "image/webp";
            case "mp4", "m4v" -> "video/mp4";
            case "webm" -> "video/webm";
            case "mov" -> "video/quicktime";
            default -> null;
        };
    }

    private HackathonMaterial requirePublicMaterial(Long eventId, Long materialId) {
        requirePublic(eventId);
        HackathonMaterial material = requireMaterial(eventId, materialId);
        if (material.getProjectId() != null
                && !projects.existsByEventIdAndIdAndPublishedTrue(eventId, material.getProjectId())) throw notFound();
        return material;
    }

    private HackathonMaterial requireMaterial(Long eventId, Long materialId) {
        return materials.findByEventIdAndId(eventId, materialId).orElseThrow(HackathonEventService::notFound);
    }

    private HackathonProject requireProject(Long eventId, String projectId) {
        return projects.findByEventIdAndId(eventId, projectId).orElseThrow(HackathonEventService::notFound);
    }

    private HackathonEvent requirePublic(Long id) {
        HackathonEvent event = requireEvent(id);
        if (!event.isPublished()) throw notFound();
        return event;
    }

    private HackathonEvent requireEvent(Long id) {
        return events.findById(id).orElseThrow(HackathonEventService::notFound);
    }

    private HackathonEvent lock(Long id) {
        return events.lockById(id).orElseThrow(HackathonEventService::notFound);
    }

    private boolean isMutable(HackathonEvent event) {
        return !event.isOpen() && !reviews.existsByEventId(event.getId());
    }

    private void requireMutable(HackathonEvent event) {
        if (!isMutable(event)) throw conflict("평가 중이거나 평가가 있는 행사의 작품과 자료는 변경할 수 없습니다.");
    }

    private static void copyEvent(HackathonEvent event, HackathonEventWrite write) {
        if (write == null) throw invalid();
        event.setTitle(text(write.title(), 120, true));
        event.setYear(exactInt(write.year(), 2000, 2200));
        event.setSemester(exactInt(write.semester(), 1, 2));
        event.setTheme(text(write.theme(), 200, false));
        event.setIntroduction(multiline(write.introduction(), 10000, false));
        event.setRules(multiline(write.rules(), 10000, false));
        if ((write.startsAt() == null) != (write.endsAt() == null)
                || (write.startsAt() != null && write.startsAt().isAfter(write.endsAt()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "개발 기간은 시작과 종료를 함께 입력하고, 시작이 종료보다 늦을 수 없습니다.");
        }
        event.setStartsAt(write.startsAt());
        event.setEndsAt(write.endsAt());
    }

    private void copyProject(HackathonProject project, HackathonProjectWrite write, boolean creating) {
        if (write == null) throw invalid();
        if (write.teamName() != null) project.setTeamName(text(write.teamName(), 120, false));
        if (write.published() != null) project.setPublished(write.published());
        if (!project.isPublished() && (project.getTeamName() == null || project.getTeamName().isBlank())) throw invalid();
        copyWork(project, write.title(), write.author(), write.description(), write.github(), write.live());
        if (write.memberIds() != null) {
            List<Long> ids = write.memberIds();
            if (ids.size() > 30 || ids.stream().anyMatch(id -> id == null || id <= 0)) throw invalid();
            Set<Long> selected = Set.copyOf(ids);
            if (members.findAllById(selected).size() != selected.size()) throw invalid();
            project.getMemberIds().retainAll(selected);
            project.getMemberIds().addAll(selected);
        }
        Integer position = write.position() == null ? null : exactInt(write.position(), 0, 9999);
        if (position == null) {
            if (creating) {
                int last = projects.maxPositionByEventId(project.getEventId()).orElse(-1);
                if (last == 9999) throw conflict("작품 순서가 최대값입니다. 순서를 지정해 주세요.");
                position = last + 1;
            } else position = project.getPosition();
        }
        project.setPosition(position);
    }

    private static void copyWork(HackathonProject project, String title, String author, String description, String github, String live) {
        project.setTitle(text(title, 120, project.isPublished()));
        project.setAuthor(text(author, 200, project.isPublished()));
        project.setDescription(multiline(description, 5000, project.isPublished()));
        project.setGithub(link(github));
        project.setLive(link(live));
    }

    private static String link(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = text(raw, 2000, true);
        try {
            var uri = java.net.URI.create(value);
            if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null
                    || uri.getRawUserInfo() != null) throw invalid();
        } catch (IllegalArgumentException ex) { throw invalid(); }
        return value;
    }

    private static int exactInt(BigDecimal raw, int min, int max) {
        if (raw == null) throw invalid();
        try {
            int value = raw.intValueExact();
            if (value < min || value > max) throw invalid();
            return value;
        } catch (ArithmeticException ex) { throw invalid(); }
    }

    private static String text(String raw, int max, boolean required) {
        return checkedText(raw, max, required, false);
    }

    private static String multiline(String raw, int max, boolean required) {
        return checkedText(raw, max, required, true);
    }

    private static String checkedText(String raw, int max, boolean required, boolean multiline) {
        String value = raw == null ? "" : raw.strip();
        if ((required && value.isEmpty()) || value.length() > max
                || value.codePoints().anyMatch(cp -> Character.isISOControl(cp)
                        && (!multiline || (cp != '\n' && cp != '\r' && cp != '\t')))) throw invalid();
        return value;
    }

    private static ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "입력값을 확인해주세요."); }
    private static ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "행사 또는 자료를 찾을 수 없습니다."); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
