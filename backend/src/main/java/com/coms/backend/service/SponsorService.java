package com.coms.backend.service;

import com.coms.backend.domain.Sponsor;
import com.coms.backend.domain.SponsorImage;
import com.coms.backend.domain.SponsorPageSettingsEntity;
import com.coms.backend.domain.SponsorTier;
import com.coms.backend.dto.SponsorAdminResponse;
import com.coms.backend.dto.SponsorImageResponse;
import com.coms.backend.dto.SponsorPageResponse;
import com.coms.backend.dto.SponsorPageSettings;
import com.coms.backend.dto.SponsorRequest;
import com.coms.backend.dto.SponsorResponse;
import com.coms.backend.dto.SponsorTierRequest;
import com.coms.backend.dto.SponsorTierResponse;
import com.coms.backend.repository.SponsorImageRepository;
import com.coms.backend.repository.SponsorPageSettingsRepository;
import com.coms.backend.repository.SponsorRepository;
import com.coms.backend.repository.SponsorTierRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 후원자 도메인 전체: 공개 목록/페이지 설정 읽기, 회장 전용 CRUD, 로고·배너 이미지 파이프라인.
 *
 * <p>Lives in {@code com.coms.backend.service} because the magic-byte {@link UploadSniffer}
 * is package-private — the same reason {@code CommunityMediaService} sits here.
 *
 * <p>Two invariants are enforced here rather than at the controller: the public projection
 * never carries {@code amountNote}, and an anonymous sponsor is reduced to "익명 후원자" with
 * no logo and no outbound link before it ever leaves this class.
 */
@Service
@Transactional
public class SponsorService {

    private static final Logger log = LoggerFactory.getLogger(SponsorService.class);

    static final String ANONYMOUS_NAME = "익명 후원자";
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");
    private static final Pattern HEX_COLOR = Pattern.compile("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$");
    private static final Set<String> LAYOUTS = Set.of("grid", "list");
    private static final String DEFAULT_ACCENT = "#0071e3";
    /** Prefix on the stored key so sponsor uploads are recognisable in the flat upload directory. */
    private static final String STORAGE_PREFIX = "sponsors";

    private final SponsorRepository sponsorRepository;
    private final SponsorTierRepository tierRepository;
    private final SponsorImageRepository imageRepository;
    private final SponsorPageSettingsRepository settingsRepository;
    private final StorageService storageService;
    private final RichContentSanitizer sanitizer;
    private final SponsorImageDeleter imageDeleter;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Clock clock;

    public SponsorService(SponsorRepository sponsorRepository,
                          SponsorTierRepository tierRepository,
                          SponsorImageRepository imageRepository,
                          SponsorPageSettingsRepository settingsRepository,
                          StorageService storageService,
                          RichContentSanitizer sanitizer,
                          SponsorImageDeleter imageDeleter,
                          Clock clock) {
        this.sponsorRepository = sponsorRepository;
        this.tierRepository = tierRepository;
        this.imageRepository = imageRepository;
        this.settingsRepository = settingsRepository;
        this.storageService = storageService;
        this.sanitizer = sanitizer;
        this.imageDeleter = imageDeleter;
        this.clock = clock;
    }

    // ---- Public reads --------------------------------------------------------------------

    /**
     * Tiers in {@code sortOrder} order, each carrying its publicly visible sponsors ordered by
     * {@code sortOrder} then name. Tiers with no visible sponsor are dropped, and sponsors with
     * no tier are collected into a trailing tier-less group (id {@code null}).
     */
    @Transactional(readOnly = true)
    public List<SponsorTierResponse> publicList() {
        LocalDate today = today();
        Map<Long, List<Sponsor>> byTier = sponsorRepository.findAllByOrderBySortOrderAscNameAscIdAsc().stream()
                .filter(sponsor -> sponsor.isPubliclyVisible(today))
                .collect(Collectors.groupingBy(
                        sponsor -> sponsor.getTierId() == null ? 0L : sponsor.getTierId(),
                        java.util.LinkedHashMap::new,
                        Collectors.toList()));

        List<SponsorTierResponse> groups = new ArrayList<>();
        for (SponsorTier tier : tierRepository.findAllByOrderBySortOrderAscIdAsc()) {
            List<Sponsor> sponsors = byTier.getOrDefault(tier.getId(), List.of());
            if (sponsors.isEmpty()) continue;
            groups.add(new SponsorTierResponse(
                    tier.getId(),
                    tier.getName(),
                    tier.getColor(),
                    tier.getDescription(),
                    tier.getSortOrder(),
                    sponsors.stream().map(this::toPublic).toList()
            ));
        }
        List<Sponsor> untiered = byTier.getOrDefault(0L, List.of());
        if (!untiered.isEmpty()) {
            groups.add(new SponsorTierResponse(
                    null, "", null, null, Integer.MAX_VALUE,
                    untiered.stream().map(this::toPublic).toList()
            ));
        }
        return groups;
    }

    @Transactional(readOnly = true)
    public SponsorPageResponse page() {
        LocalDate today = today();
        SponsorPageSettings settings = normalizeForRead(readSettings());
        long visible = sponsorRepository.findAllByOrderBySortOrderAscNameAscIdAsc().stream()
                .filter(sponsor -> sponsor.isPubliclyVisible(today))
                .count();
        return new SponsorPageResponse(
                settings,
                settings.bannerImageId() == null ? null : imageUrl(settings.bannerImageId()),
                (int) visible,
                (int) tierRepository.count()
        );
    }

    // ---- Admin: sponsors -----------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<SponsorAdminResponse> adminList() {
        LocalDate today = today();
        Map<Long, SponsorTier> tiers = tierRepository.findAll().stream()
                .collect(Collectors.toMap(SponsorTier::getId, Function.identity()));
        return sponsorRepository.findAllByOrderBySortOrderAscNameAscIdAsc().stream()
                .map(sponsor -> toAdmin(sponsor, tiers, today))
                .toList();
    }

    public SponsorAdminResponse create(SponsorRequest request) {
        Sponsor sponsor = new Sponsor();
        apply(sponsor, request);
        if (request.sortOrder() == null) {
            sponsor.setSortOrder(sponsorRepository.findAllByOrderBySortOrderAscNameAscIdAsc().size());
        }
        return toAdmin(sponsorRepository.save(sponsor));
    }

    public SponsorAdminResponse update(Long id, SponsorRequest request) {
        Sponsor sponsor = requireSponsor(id);
        Long previousLogoImageId = sponsor.getLogoImageId();
        apply(sponsor, request);
        SponsorAdminResponse updated = toAdmin(sponsorRepository.saveAndFlush(sponsor));
        if (!Objects.equals(previousLogoImageId, sponsor.getLogoImageId())) {
            deleteImageIfUnreferenced(previousLogoImageId);
        }
        return updated;
    }

    public SponsorAdminResponse get(Long id) {
        return toAdmin(requireSponsor(id));
    }

    public void delete(Long id) {
        Sponsor sponsor = requireSponsor(id);
        Long logoImageId = sponsor.getLogoImageId();
        sponsorRepository.delete(sponsor);
        sponsorRepository.flush();
        deleteImageIfUnreferenced(logoImageId);
    }

    /** Rewrites {@code sortOrder} to match the given id order; ids not listed keep their place after. */
    public void reorder(List<Long> ids) {
        List<Long> requested = ids == null ? List.of() : ids.stream().filter(Objects::nonNull).distinct().toList();
        Map<Long, Sponsor> byId = sponsorRepository.findAllById(requested).stream()
                .collect(Collectors.toMap(Sponsor::getId, Function.identity()));
        if (byId.size() != requested.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "존재하지 않는 후원자가 포함되어 있습니다.");
        }
        for (int i = 0; i < requested.size(); i++) {
            byId.get(requested.get(i)).setSortOrder(i);
        }
        sponsorRepository.saveAll(byId.values());
    }

    /** 회장 전용 장부용 CSV. 금액 메모가 들어가므로 공개 엔드포인트로 노출하지 않는다. */
    @Transactional(readOnly = true)
    public String exportCsv() {
        LocalDate today = today();
        Map<Long, SponsorTier> tiers = tierRepository.findAll().stream()
                .collect(Collectors.toMap(SponsorTier::getId, Function.identity()));
        StringBuilder csv = new StringBuilder("name,tier,amountNote,since,until,anonymous,visible\n");
        for (Sponsor sponsor : sponsorRepository.findAllByOrderBySortOrderAscNameAscIdAsc()) {
            SponsorTier tier = sponsor.getTierId() == null ? null : tiers.get(sponsor.getTierId());
            csv.append(csvCell(sponsor.getName())).append(',')
                    .append(csvCell(tier == null ? "" : tier.getName())).append(',')
                    .append(csvCell(sponsor.getAmountNote())).append(',')
                    .append(csvCell(sponsor.getSinceDate() == null ? "" : sponsor.getSinceDate().toString())).append(',')
                    .append(csvCell(sponsor.getUntilDate() == null ? "" : sponsor.getUntilDate().toString())).append(',')
                    .append(sponsor.isAnonymous()).append(',')
                    .append(sponsor.isPubliclyVisible(today))
                    .append('\n');
        }
        return csv.toString();
    }

    // ---- Admin: tiers --------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<SponsorTierResponse> adminTiers() {
        return tierRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(tier -> new SponsorTierResponse(
                        tier.getId(), tier.getName(), tier.getColor(), tier.getDescription(), tier.getSortOrder(), List.of()))
                .toList();
    }

    public SponsorTierResponse createTier(SponsorTierRequest request) {
        SponsorTier tier = new SponsorTier();
        applyTier(tier, request);
        if (request.sortOrder() == null) {
            tier.setSortOrder(tierRepository.findAllByOrderBySortOrderAscIdAsc().size());
        }
        return toTierResponse(tierRepository.save(tier));
    }

    public SponsorTierResponse updateTier(Long id, SponsorTierRequest request) {
        SponsorTier tier = requireTier(id);
        applyTier(tier, request);
        return toTierResponse(tierRepository.save(tier));
    }

    public SponsorTierResponse getTier(Long id) {
        return toTierResponse(requireTier(id));
    }

    public void deleteTier(Long id) {
        SponsorTier tier = requireTier(id);
        if (sponsorRepository.countByTierId(id) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이 등급을 사용하는 후원자가 있어 삭제할 수 없습니다.");
        }
        tierRepository.delete(tier);
    }

    public void reorderTiers(List<Long> ids) {
        List<Long> requested = ids == null ? List.of() : ids.stream().filter(Objects::nonNull).distinct().toList();
        Map<Long, SponsorTier> byId = tierRepository.findAllById(requested).stream()
                .collect(Collectors.toMap(SponsorTier::getId, Function.identity()));
        if (byId.size() != requested.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "존재하지 않는 등급이 포함되어 있습니다.");
        }
        for (int i = 0; i < requested.size(); i++) {
            byId.get(requested.get(i)).setSortOrder(i);
        }
        tierRepository.saveAll(byId.values());
    }

    // ---- Admin: page settings ------------------------------------------------------------

    @Transactional(readOnly = true)
    public SponsorPageSettings adminSettings() {
        return normalizeForRead(readSettings());
    }

    /**
     * Binds the raw body with this class's own strict {@link ObjectMapper} rather than taking a
     * typed controller parameter: Spring Boot turns {@code FAIL_ON_UNKNOWN_PROPERTIES} off on the
     * MVC mapper, so an unknown settings key would otherwise be silently dropped instead of refused.
     */
    public SponsorPageSettings saveSettings(Map<String, Object> body) {
        SponsorPageSettings incoming;
        try {
            incoming = objectMapper.convertValue(body, SponsorPageSettings.class);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알 수 없는 페이지 설정 항목이 있습니다.");
        }
        SponsorPageSettings validated = validate(incoming);
        Long previousBannerImageId = readSettings().bannerImageId();
        SponsorPageSettingsEntity entity = settingsEntity();
        try {
            entity.setSettings(objectMapper.writeValueAsString(validated));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "페이지 설정을 저장하지 못했습니다.");
        }
        settingsRepository.saveAndFlush(entity);
        if (!Objects.equals(previousBannerImageId, validated.bannerImageId())) {
            deleteImageIfUnreferenced(previousBannerImageId);
        }
        return validated;
    }

    // ---- Admin: images -------------------------------------------------------------------

    public SponsorImageResponse uploadImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지 파일을 선택해주세요.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType();
        if (!ALLOWED_IMAGE_TYPES.contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JPG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.");
        }
        UploadSniffer.ImageType sniffed = UploadSniffer.imageType(UploadSniffer.header(file));
        if (sniffed == null || !sniffed.mimeType().equals(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지 파일 내용이 형식과 일치하지 않습니다.");
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지는 5MB 이하만 업로드할 수 있습니다.");
        }
        int[] dimensions = readDimensions(file);
        try {
            SponsorImage image = new SponsorImage();
            image.setStorageKey(STORAGE_PREFIX + "-" + storageService.storeImage(file, contentType));
            image.setOriginalName(file.getOriginalFilename());
            image.setMime(contentType);
            image.setSizeBytes(file.getSize());
            image.setWidth(dimensions[0] > 0 ? dimensions[0] : null);
            image.setHeight(dimensions[1] > 0 ? dimensions[1] : null);
            SponsorImage saved = imageRepository.save(image);
            return new SponsorImageResponse(saved.getId(), adminImageUrl(saved.getId()));
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
        }
    }

    @Transactional(readOnly = true)
    public SponsorImage imageMeta(Long id) {
        return imageRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public SponsorImage publicImageMeta(Long id) {
        Long bannerImageId = readSettings().bannerImageId();
        return imageRepository.findPublicById(id, bannerImageId, today())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public Resource loadImage(SponsorImage image) {
        return storageService.load(storedName(image));
    }

    public void deleteImage(Long id) {
        SponsorImage image = imageMeta(id);
        Long bannerImageId = readSettings().bannerImageId();
        if (sponsorRepository.existsByLogoImageId(id) || Objects.equals(bannerImageId, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "사용 중인 이미지는 삭제할 수 없습니다.");
        }
        imageDeleter.delete(image);
    }

    private void deleteImageIfUnreferenced(Long id) {
        if (id == null || sponsorRepository.existsByLogoImageId(id)
                || Objects.equals(readSettings().bannerImageId(), id)) {
            return;
        }
        imageRepository.findById(id).ifPresent(imageDeleter::delete);
    }

    /**
     * Each orphan is deleted in its own {@code REQUIRES_NEW} transaction via
     * {@link SponsorImageDeleter#deleteOrphanInOwnTransaction(Long)} so one bad row cannot abort
     * the rest of the nightly batch; a failure is logged and skipped rather than propagated.
     */
    @Transactional(readOnly = true)
    public int deleteOrphanedImagesOlderThan(LocalDateTime cutoff) {
        Long bannerImageId = readSettings().bannerImageId();
        List<SponsorImage> orphaned = imageRepository.findOrphanedOlderThan(cutoff, bannerImageId);
        int deleted = 0;
        for (SponsorImage image : orphaned) {
            try {
                imageDeleter.deleteOrphanInOwnTransaction(image.getId());
                deleted++;
            } catch (RuntimeException e) {
                log.warn("Failed to purge orphaned sponsor image {}", image.getId(), e);
            }
        }
        return deleted;
    }

    // ---- Internals -----------------------------------------------------------------------

    private LocalDate today() {
        return LocalDate.now(clock);
    }

    static String imageUrl(Long imageId) {
        return "/api/sponsors/images/" + imageId;
    }

    /**
     * The admin equivalent of {@link #imageUrl(Long)} — served by {@code AdminSponsorController}
     * without the public visibility gate, for admin previews of hidden/anonymous/expired sponsors.
     */
    static String adminImageUrl(Long imageId) {
        return "/api/admin/sponsors/images/" + imageId;
    }

    /**
     * Strips the {@code sponsors-} bookkeeping prefix back off to get the real storage filename.
     * Package-private and static so {@link SponsorImageDeleter} can reuse it.
     */
    static String storedName(SponsorImage image) {
        String key = image.getStorageKey() == null ? "" : image.getStorageKey();
        return key.startsWith(STORAGE_PREFIX + "-") ? key.substring(STORAGE_PREFIX.length() + 1) : key;
    }

    private Sponsor requireSponsor(Long id) {
        return sponsorRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private SponsorTier requireTier(Long id) {
        return tierRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void apply(Sponsor sponsor, SponsorRequest request) {
        sponsor.setName(requireText(request.name(), 80, "후원자 이름을 입력해주세요."));
        sponsor.setTierId(request.tierId() == null ? null : requireTier(request.tierId()).getId());
        sponsor.setLogoImageId(request.logoImageId() == null ? null : imageMeta(request.logoImageId()).getId());
        sponsor.setLinkUrl(validatedLink(request.linkUrl()));
        sponsor.setDescription(sanitizeOptional(request.description()));
        sponsor.setAmountNote(trimToNull(request.amountNote()));
        LocalDate since = request.sinceDate();
        LocalDate until = request.untilDate();
        if (since != null && until != null && until.isBefore(since)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "후원 종료일은 시작일보다 빠를 수 없습니다.");
        }
        sponsor.setSinceDate(since);
        sponsor.setUntilDate(until);
        sponsor.setAnonymous(Boolean.TRUE.equals(request.anonymous()));
        sponsor.setVisible(request.visible() == null || request.visible());
        if (request.sortOrder() != null) {
            sponsor.setSortOrder(Math.max(0, request.sortOrder()));
        }
    }

    private void applyTier(SponsorTier tier, SponsorTierRequest request) {
        tier.setName(requireText(request.name(), 40, "등급 이름을 입력해주세요."));
        tier.setColor(validatedColor(request.color(), tier.getColor()));
        tier.setDescription(trimToNull(request.description()));
        if (request.sortOrder() != null) {
            tier.setSortOrder(Math.max(0, request.sortOrder()));
        }
    }

    private SponsorResponse toPublic(Sponsor sponsor) {
        if (sponsor.isAnonymous()) {
            // No name, no logo, no outbound link — an anonymous sponsor is only ever a
            // placeholder card, and the tier/period are the only details that survive.
            return new SponsorResponse(
                    null, ANONYMOUS_NAME, sponsor.getTierId(), null, null,
                    null, sponsor.getSinceDate(), sponsor.getUntilDate(), true);
        }
        return new SponsorResponse(
                sponsor.getId(),
                sponsor.getName(),
                sponsor.getTierId(),
                sponsor.getLogoImageId() == null ? null : imageUrl(sponsor.getLogoImageId()),
                sponsor.getLinkUrl(),
                sponsor.getDescription(),
                sponsor.getSinceDate(),
                sponsor.getUntilDate(),
                false
        );
    }

    private SponsorAdminResponse toAdmin(Sponsor sponsor) {
        Map<Long, SponsorTier> tiers = tierRepository.findAll().stream()
                .collect(Collectors.toMap(SponsorTier::getId, Function.identity()));
        return toAdmin(sponsor, tiers, today());
    }

    private SponsorAdminResponse toAdmin(Sponsor sponsor, Map<Long, SponsorTier> tiers, LocalDate today) {
        SponsorTier tier = sponsor.getTierId() == null ? null : tiers.get(sponsor.getTierId());
        return new SponsorAdminResponse(
                sponsor.getId(),
                sponsor.getName(),
                sponsor.getTierId(),
                tier == null ? null : tier.getName(),
                sponsor.getLogoImageId(),
                sponsor.getLogoImageId() == null ? null : adminImageUrl(sponsor.getLogoImageId()),
                sponsor.getLinkUrl(),
                sponsor.getDescription(),
                sponsor.getAmountNote(),
                sponsor.getSinceDate(),
                sponsor.getUntilDate(),
                sponsor.isAnonymous(),
                sponsor.isVisible(),
                sponsor.isExpired(today),
                sponsor.getSortOrder()
        );
    }

    private SponsorTierResponse toTierResponse(SponsorTier tier) {
        return new SponsorTierResponse(
                tier.getId(), tier.getName(), tier.getColor(), tier.getDescription(), tier.getSortOrder(), List.of());
    }

    private SponsorPageSettingsEntity settingsEntity() {
        return settingsRepository.findById(1).orElseGet(() -> {
            SponsorPageSettingsEntity created = new SponsorPageSettingsEntity();
            created.setId(1);
            created.setSettings("{}");
            return settingsRepository.save(created);
        });
    }

    private SponsorPageSettings readSettings() {
        try {
            return objectMapper.readValue(settingsEntity().getSettings(), SponsorPageSettings.class);
        } catch (Exception e) {
            // A settings document we cannot parse must not take the public page down.
            return new SponsorPageSettings(null, null, null, null, null, null, null, null, null, null);
        }
    }

    /** Fills the blanks so both the public page and the admin form always get concrete values. */
    private SponsorPageSettings normalizeForRead(SponsorPageSettings settings) {
        SponsorPageSettings.HowToSection howTo = settings.howToSection();
        return new SponsorPageSettings(
                orDefault(settings.heroTitle(), "후원자"),
                orDefault(settings.heroSubtitle(), "COM's의 활동을 함께 만들어주시는 분들입니다."),
                settings.bannerImageId(),
                settings.introHtml(),
                orDefault(settings.accentColor(), DEFAULT_ACCENT),
                settings.layout() != null && LAYOUTS.contains(settings.layout()) ? settings.layout() : "grid",
                settings.showTierLabels() == null || settings.showTierLabels(),
                orDefault(settings.thankYouMessage(), "후원해주신 모든 분들께 감사드립니다."),
                howTo == null
                        ? new SponsorPageSettings.HowToSection("후원 안내", null, null, null, null)
                        : new SponsorPageSettings.HowToSection(
                                orDefault(howTo.title(), "후원 안내"),
                                howTo.bodyHtml(),
                                howTo.contactEmail(),
                                howTo.contactLink(),
                                howTo.bankNote()),
                settings.showCounts() == null || settings.showCounts()
        );
    }

    private SponsorPageSettings validate(SponsorPageSettings settings) {
        if (settings == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "페이지 설정을 입력해주세요.");
        }
        String accent = settings.accentColor();
        if (accent != null && !accent.isBlank() && !HEX_COLOR.matcher(accent.trim()).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "강조 색상은 #RRGGBB 형식이어야 합니다.");
        }
        String layout = settings.layout();
        if (layout != null && !layout.isBlank() && !LAYOUTS.contains(layout)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "레이아웃은 grid 또는 list만 사용할 수 있습니다.");
        }
        if (settings.bannerImageId() != null) {
            imageMeta(settings.bannerImageId());
        }
        SponsorPageSettings.HowToSection howTo = settings.howToSection();
        SponsorPageSettings.HowToSection safeHowTo = howTo == null ? null : new SponsorPageSettings.HowToSection(
                boundedText(howTo.title(), 80),
                sanitizeOptional(howTo.bodyHtml()),
                validatedEmail(howTo.contactEmail()),
                validatedLink(howTo.contactLink()),
                boundedText(howTo.bankNote(), 200)
        );
        return new SponsorPageSettings(
                boundedText(settings.heroTitle(), 80),
                boundedText(settings.heroSubtitle(), 200),
                settings.bannerImageId(),
                sanitizeOptional(settings.introHtml()),
                accent == null || accent.isBlank() ? DEFAULT_ACCENT : accent.trim().toLowerCase(Locale.ROOT),
                layout == null || layout.isBlank() ? "grid" : layout,
                settings.showTierLabels() == null || settings.showTierLabels(),
                boundedText(settings.thankYouMessage(), 200),
                safeHowTo,
                settings.showCounts() == null || settings.showCounts()
        );
    }

    /**
     * Runs admin-authored copy through the same sanitizer notices use, so rich-editor block
     * content is normalised and any plain text carrying a script/handler payload is rejected.
     */
    private String sanitizeOptional(String value) {
        String trimmed = trimToNull(value);
        return trimmed == null ? null : sanitizer.sanitizeContent(trimmed);
    }

    private String boundedText(String value, int maxLength) {
        String trimmed = trimToNull(value);
        if (trimmed == null) return null;
        if (trimmed.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "입력이 너무 깁니다.");
        }
        sanitizer.rejectUnsafeText(trimmed);
        return trimmed;
    }

    private String requireText(String value, int maxLength, String message) {
        String trimmed = trimToNull(value);
        if (trimmed == null || trimmed.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        sanitizer.rejectUnsafeText(trimmed);
        return trimmed;
    }

    /** Outbound sponsor links must be plain http(s) with a host — never javascript:, data:, mailto:. */
    private String validatedLink(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) return null;
        if (trimmed.length() > 500 || trimmed.chars().anyMatch(Character::isISOControl)) {
            throw invalidLink();
        }
        try {
            URI uri = new URI(trimmed);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (("http".equals(scheme) || "https".equals(scheme))
                    && uri.getHost() != null && !uri.getHost().isBlank() && uri.getUserInfo() == null) {
                return trimmed;
            }
        } catch (URISyntaxException ignored) {
            // Falls through to the same stable validation response below.
        }
        throw invalidLink();
    }

    private String validatedEmail(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) return null;
        if (trimmed.length() > 120 || !trimmed.matches("^[^\\s@<>\"']+@[^\\s@<>\"']+\\.[A-Za-z]{2,}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "문의 이메일 형식이 올바르지 않습니다.");
        }
        return trimmed;
    }

    private ResponseStatusException invalidLink() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "링크는 http 또는 https 주소만 사용할 수 있습니다.");
    }

    private String validatedColor(String value, String fallback) {
        String trimmed = trimToNull(value);
        if (trimmed == null) return fallback == null ? "#9ca3af" : fallback;
        if (!HEX_COLOR.matcher(trimmed).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "등급 색상은 #RRGGBB 형식이어야 합니다.");
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }

    private static String orDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String csvCell(String value) {
        String safe = value == null ? "" : value.replace("\"", "\"\"").replace("\n", " ").replace("\r", " ");
        return '"' + safe + '"';
    }

    /** Best-effort intrinsic size for the admin preview; a format ImageIO cannot read yields 0x0. */
    private static int[] readDimensions(MultipartFile file) {
        try (InputStream in = file.getInputStream();
             ImageInputStream stream = ImageIO.createImageInputStream(in)) {
            if (stream == null) return new int[] {0, 0};
            Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) return new int[] {0, 0};
            ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                return new int[] {reader.getWidth(0), reader.getHeight(0)};
            } finally {
                reader.dispose();
            }
        } catch (Exception e) {
            return new int[] {0, 0};
        }
    }
}
