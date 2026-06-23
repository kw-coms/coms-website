package com.coms.backend.controller;

import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityCommentResponse;
import com.coms.backend.dto.CommunityDeleteRequest;
import com.coms.backend.dto.DeletedCommunityPostAppealRequest;
import com.coms.backend.dto.DeletedCommunityPostAppealResponse;
import com.coms.backend.dto.DeletedCommunityPostResponse;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.dto.CommunityPollVoteRequest;
import com.coms.backend.dto.CommunityVoteRequest;
import com.coms.backend.dto.LinkPreviewResponse;
import com.coms.backend.dto.YouTubeSearchResponse;
import com.coms.backend.domain.CommunityPostFile;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.DeletedCommunityPostImage;
import com.coms.backend.domain.DeletedCommunityPostMedia;
import com.coms.backend.service.CommunityDeletionArchiveService;
import com.coms.backend.service.CommunityService;
import com.coms.backend.service.LinkPreviewService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.HtmlUtils;

import java.nio.charset.StandardCharsets;

import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/community/posts")
public class CommunityController {
    private static final Set<String> TRUSTED_PROXIES = Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1");
    private static final String SHARE_DESCRIPTION = "여기를 눌러 내용을 확인하세요.\ncoms.kw.ac.kr";

    private final CommunityService communityService;
    private final CommunityDeletionArchiveService communityDeletionArchiveService;
    private final LinkPreviewService linkPreviewService;
    private final String publicBaseUrl;

    public CommunityController(CommunityService communityService,
                               CommunityDeletionArchiveService communityDeletionArchiveService,
                               LinkPreviewService linkPreviewService,
                               @Value("${app.public-base-url:}") String publicBaseUrl) {
        this.communityService = communityService;
        this.communityDeletionArchiveService = communityDeletionArchiveService;
        this.linkPreviewService = linkPreviewService;
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.trim();
    }

    @GetMapping
    public ResponseEntity<List<CommunityPostResponse>> list(Authentication authentication) {
        return ResponseEntity.ok(communityService.list(authentication.getName()));
    }

    @GetMapping("/deleted/me")
    public ResponseEntity<List<DeletedCommunityPostResponse>> myDeletedPosts(Authentication authentication) {
        return ResponseEntity.ok(communityDeletionArchiveService.mine(authentication.getName()));
    }

    @GetMapping("/deleted/{id}/images/{imageId}")
    public ResponseEntity<Resource> deletedImage(Authentication authentication, @PathVariable Long id, @PathVariable Long imageId) {
        DeletedCommunityPostImage meta = communityDeletionArchiveService.loadOwnImageMeta(id, imageId, authentication.getName());
        Resource resource = communityDeletionArchiveService.loadOwnImage(id, imageId, authentication.getName());
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank() ? "deleted-community-image" : meta.getOriginalName();
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @GetMapping("/deleted/{id}/media/{mediaId}")
    public ResponseEntity<Resource> deletedMedia(Authentication authentication, @PathVariable Long id, @PathVariable Long mediaId) {
        DeletedCommunityPostMedia meta = communityDeletionArchiveService.loadOwnMediaMeta(id, mediaId, authentication.getName());
        Resource resource = communityDeletionArchiveService.loadOwnMedia(id, mediaId, authentication.getName());
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank() ? "deleted-community-media" : meta.getOriginalName();
        ContentDisposition disposition = DeletedCommunityPostMedia.KIND_FILE.equals(meta.getKind())
                ? ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build()
                : ContentDisposition.inline().filename(filename, StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    @PostMapping("/deleted/{id}/appeals")
    public ResponseEntity<DeletedCommunityPostAppealResponse> appealDeletedPost(Authentication authentication,
                                                                                @PathVariable Long id,
                                                                                @Valid @RequestBody DeletedCommunityPostAppealRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(communityDeletionArchiveService.requestRestore(id, authentication.getName(), request));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CommunityPostResponse> get(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(communityService.get(authentication.getName(), id));
    }

    @GetMapping(value = "/{id}/share", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> sharePreview(@PathVariable Long id, HttpServletRequest request) {
        CommunityService.CommunityPostSharePreview preview = communityService.sharePreview(id);
        String postUrl = absoluteUrl(request, "/community/" + id);
        String imageUrl = preview.hasImage()
                ? absoluteUrl(request, "/api/community/posts/" + id + "/share-image")
                : null;
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/html;charset=UTF-8"))
                .cacheControl(CacheControl.noStore())
                .body(sharePreviewHtml(preview, postUrl, imageUrl));
    }

    @GetMapping("/{id}/share-data")
    public ResponseEntity<CommunityShareData> shareData(@PathVariable Long id, HttpServletRequest request) {
        CommunityService.CommunityPostSharePreview preview = communityService.sharePreview(id);
        String postUrl = absoluteUrl(request, "/community/" + id);
        String imageUrl = preview.hasImage()
                ? absoluteUrl(request, "/api/community/posts/" + id + "/share-image")
                : null;
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new CommunityShareData(
                        preview.id(),
                        preview.title(),
                        SHARE_DESCRIPTION,
                        postUrl,
                        imageUrl,
                        preview.hasImage()
                ));
    }

    @GetMapping("/{id}/share-image")
    public ResponseEntity<Resource> shareImage(@PathVariable Long id) {
        CommunityService.CommunityPostShareImage image = communityService.loadShareImage(id);
        String filename = filenameOrFallback(image.originalName(), image.mimeType(), "community-preview");
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePublic())
                .contentType(mediaType(image.mimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(image.resource());
    }

    @PostMapping
    public ResponseEntity<CommunityPostResponse> create(Authentication authentication,
                                                       @Valid @RequestBody CommunityPostRequest request,
                                                       HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(communityService.create(authentication.getName(), request, null, resolveClientIp(servletRequest)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<CommunityPostResponse> createWithImage(Authentication authentication,
                                                                 @RequestParam String title,
                                                                 @RequestParam String content,
                                                                 @RequestParam(defaultValue = "GENERAL") String category,
                                                                 @RequestParam(value = "anonymousName", required = false) String anonymousName,
                                                                 HttpServletRequest servletRequest,
                                                                 @RequestParam(value = "image", required = false) MultipartFile image) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(communityService.create(
                        authentication.getName(),
                        new CommunityPostRequest(title, content, category, false, anonymousName),
                        image,
                        resolveClientIp(servletRequest)
                ));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<CommunityPostResponse> update(Authentication authentication,
                                                        @PathVariable Long id,
                                                        @Valid @RequestBody CommunityPostRequest request,
                                                        HttpServletRequest servletRequest) {
        return ResponseEntity.ok(communityService.update(authentication.getName(), id, request, null, resolveClientIp(servletRequest)));
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<CommunityPostResponse> updateWithImage(Authentication authentication,
                                                                 @PathVariable Long id,
                                                                 @RequestParam String title,
                                                                 @RequestParam String content,
                                                                 @RequestParam(defaultValue = "GENERAL") String category,
                                                                 @RequestParam(defaultValue = "false") boolean removeImage,
                                                                 @RequestParam(value = "anonymousName", required = false) String anonymousName,
                                                                 HttpServletRequest servletRequest,
                                                                 @RequestParam(value = "image", required = false) MultipartFile image) {
        return ResponseEntity.ok(communityService.update(
                authentication.getName(),
                id,
                new CommunityPostRequest(title, content, category, removeImage, anonymousName),
                image,
                resolveClientIp(servletRequest)
        ));
    }

    @PostMapping("/{id}/vote")
    public ResponseEntity<CommunityPostResponse> vote(Authentication authentication,
                                                      @PathVariable Long id,
                                                      @Valid @RequestBody CommunityVoteRequest request) {
        return ResponseEntity.ok(communityService.vote(authentication.getName(), id, request.value()));
    }

    @PostMapping("/{id}/poll-votes")
    public ResponseEntity<CommunityPostResponse> votePoll(Authentication authentication,
                                                          @PathVariable Long id,
                                                          @Valid @RequestBody CommunityPollVoteRequest request) {
        return ResponseEntity.ok(communityService.votePoll(authentication.getName(), id, request));
    }

    @PostMapping("/{id}/polls/{pollId}/close")
    public ResponseEntity<CommunityPostResponse> closePoll(Authentication authentication,
                                                           @PathVariable Long id,
                                                           @PathVariable String pollId) {
        return ResponseEntity.ok(communityService.closePoll(authentication.getName(), id, pollId));
    }

    @GetMapping("/tools/youtube/search")
    public ResponseEntity<YouTubeSearchResponse> searchYouTube(@RequestParam String q) {
        return ResponseEntity.ok(communityService.searchYouTube(q));
    }

    @GetMapping("/tools/link-preview")
    public ResponseEntity<LinkPreviewResponse> linkPreview(@RequestParam String url) {
        return ResponseEntity.ok(linkPreviewService.preview(url));
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<Resource> image(Authentication authentication, @PathVariable Long id) {
        communityService.requireReadablePost(authentication.getName(), id);
        CommunityPost post = communityService.imagePost(id);
        Resource resource = communityService.loadImage(id);
        ContentDisposition disposition = ContentDisposition.inline()
                .filename(post.getImageOriginalName() == null ? "community-image" : post.getImageOriginalName(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(mediaType(post.getImageMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    @GetMapping("/{id}/image/download")
    public ResponseEntity<Resource> downloadImage(Authentication authentication, @PathVariable Long id) {
        communityService.requireReadablePost(authentication.getName(), id);
        CommunityPost post = communityService.imagePost(id);
        Resource resource = communityService.loadImage(id);
        String filename = filenameOrFallback(post.getImageOriginalName(), post.getImageMimeType(), "community-image");
        return ResponseEntity.ok()
                .contentType(mediaType(post.getImageMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @PostMapping(path = "/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<Long>> uploadImages(Authentication authentication,
                                                   @PathVariable Long id,
                                                   @RequestParam("images") List<MultipartFile> images) {
        List<Long> ids = communityService.addImages(authentication.getName(), id, images);
        return ResponseEntity.status(HttpStatus.CREATED).body(ids);
    }

    @GetMapping("/{id}/images/{imageId}")
    public ResponseEntity<Resource> getImage(Authentication authentication, @PathVariable Long id, @PathVariable Long imageId) {
        communityService.requireReadablePost(authentication.getName(), id);
        com.coms.backend.domain.CommunityPostImage meta = communityService.loadExtraImageMeta(id, imageId);
        Resource resource = communityService.loadExtraImage(id, imageId);
        String mimeType = meta.getMimeType();
        String filename = meta.getOriginalName() == null ? "image" : meta.getOriginalName();
        return ResponseEntity.ok()
                .contentType(mediaType(mimeType))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @GetMapping("/{id}/images/{imageId}/download")
    public ResponseEntity<Resource> downloadExtraImage(Authentication authentication, @PathVariable Long id, @PathVariable Long imageId) {
        communityService.requireReadablePost(authentication.getName(), id);
        com.coms.backend.domain.CommunityPostImage meta = communityService.loadExtraImageMeta(id, imageId);
        Resource resource = communityService.loadExtraImage(id, imageId);
        String filename = filenameOrFallback(meta.getOriginalName(), meta.getMimeType(), "image");
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @DeleteMapping("/{id}/images/{imageId}")
    public ResponseEntity<Void> deleteImage(Authentication authentication,
                                            @PathVariable Long id,
                                            @PathVariable Long imageId) {
        communityService.deleteImage(authentication.getName(), id, imageId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(path = "/{id}/videos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Long> uploadVideo(Authentication authentication,
                                            @PathVariable Long id,
                                            @RequestParam("video") MultipartFile video) {
        Long videoId = communityService.addVideo(authentication.getName(), id, video);
        return ResponseEntity.status(HttpStatus.CREATED).body(videoId);
    }

    @GetMapping("/{id}/videos/{videoId}")
    public ResponseEntity<Resource> streamVideo(Authentication authentication, @PathVariable Long id, @PathVariable Long videoId) {
        communityService.requireReadablePost(authentication.getName(), id);
        com.coms.backend.domain.CommunityPostVideo meta = communityService.loadVideoMeta(id, videoId);
        Resource resource = communityService.loadVideo(id, videoId);
        String filename = meta.getOriginalName() == null ? "video" : meta.getOriginalName();
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @GetMapping("/{id}/videos/{videoId}/download")
    public ResponseEntity<Resource> downloadVideo(Authentication authentication, @PathVariable Long id, @PathVariable Long videoId) {
        communityService.requireReadablePost(authentication.getName(), id);
        com.coms.backend.domain.CommunityPostVideo meta = communityService.loadVideoMeta(id, videoId);
        Resource resource = communityService.loadVideo(id, videoId);
        String filename = filenameOrFallback(meta.getOriginalName(), meta.getMimeType(), "video");
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @DeleteMapping("/{id}/videos/{videoId}")
    public ResponseEntity<Void> deleteVideo(Authentication authentication,
                                            @PathVariable Long id,
                                            @PathVariable Long videoId) {
        communityService.deleteVideo(authentication.getName(), id, videoId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(path = "/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Long> uploadFile(Authentication authentication,
                                           @PathVariable Long id,
                                           @RequestParam("file") MultipartFile file) {
        Long fileId = communityService.addFile(authentication.getName(), id, file);
        return ResponseEntity.status(HttpStatus.CREATED).body(fileId);
    }

    @GetMapping("/{id}/files/{fileId}/download")
    public ResponseEntity<Resource> downloadFile(Authentication authentication, @PathVariable Long id, @PathVariable Long fileId) {
        communityService.requireReadablePost(authentication.getName(), id);
        CommunityPostFile meta = communityService.loadFileMeta(id, fileId);
        Resource resource = communityService.loadFile(id, fileId);
        String filename = filenameOrFallback(meta.getOriginalName(), meta.getMimeType(), "attachment");
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication,
                                       @PathVariable Long id,
                                       @RequestParam(required = false) String reason,
                                       @RequestBody(required = false) CommunityDeleteRequest request) {
        String effectiveReason = request != null ? request.reason() : reason;
        communityService.delete(authentication.getName(), id, effectiveReason);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/comments")
    public ResponseEntity<List<CommunityCommentResponse>> listComments(Authentication authentication,
                                                                        @PathVariable Long id) {
        return ResponseEntity.ok(communityService.listComments(id, authentication.getName()));
    }

    @PostMapping("/{id}/comments")
    public ResponseEntity<CommunityCommentResponse> addComment(Authentication authentication,
                                                               @PathVariable Long id,
                                                               @Valid @RequestBody CommunityCommentRequest request,
                                                               HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(communityService.addComment(id, authentication.getName(), request, resolveClientIp(servletRequest)));
    }

    @PatchMapping("/{id}/comments/{commentId}")
    public ResponseEntity<CommunityCommentResponse> updateComment(Authentication authentication,
                                                                  @PathVariable Long id,
                                                                  @PathVariable Long commentId,
                                                                  @Valid @RequestBody CommunityCommentRequest request) {
        return ResponseEntity.ok(communityService.updateComment(id, commentId, authentication.getName(), request));
    }

    @DeleteMapping("/{id}/comments/{commentId}")
    public ResponseEntity<Void> deleteComment(Authentication authentication,
                                              @PathVariable Long id,
                                              @PathVariable Long commentId) {
        communityService.deleteComment(id, commentId, authentication.getName());
        return ResponseEntity.noContent().build();
    }

    private MediaType mediaType(String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private String sharePreviewHtml(CommunityService.CommunityPostSharePreview preview,
                                    String postUrl,
                                    String imageUrl) {
        String title = html(preview.title());
        String description = html(SHARE_DESCRIPTION);
        String escapedPostUrl = html(postUrl);
        StringBuilder html = new StringBuilder();
        html.append("<!doctype html><html lang=\"ko\"><head>");
        html.append("<meta charset=\"utf-8\">");
        html.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
        html.append("<meta name=\"robots\" content=\"noindex,nofollow\">");
        html.append("<title>").append(title).append("</title>");
        html.append("<link rel=\"canonical\" href=\"").append(escapedPostUrl).append("\">");
        html.append("<meta property=\"og:type\" content=\"article\">");
        html.append("<meta property=\"og:site_name\" content=\"COM's\">");
        html.append("<meta property=\"og:title\" content=\"").append(title).append("\">");
        html.append("<meta property=\"og:description\" content=\"").append(description).append("\">");
        html.append("<meta property=\"og:url\" content=\"").append(escapedPostUrl).append("\">");
        html.append("<meta name=\"twitter:title\" content=\"").append(title).append("\">");
        html.append("<meta name=\"twitter:description\" content=\"").append(description).append("\">");
        if (imageUrl != null) {
            String escapedImageUrl = html(imageUrl);
            html.append("<meta property=\"og:image\" content=\"").append(escapedImageUrl).append("\">");
            html.append("<meta property=\"og:image:secure_url\" content=\"").append(escapedImageUrl).append("\">");
            html.append("<meta name=\"twitter:card\" content=\"summary_large_image\">");
            html.append("<meta name=\"twitter:image\" content=\"").append(escapedImageUrl).append("\">");
        } else {
            html.append("<meta name=\"twitter:card\" content=\"summary\">");
        }
        html.append("</head><body>");
        html.append("<a href=\"").append(escapedPostUrl).append("\">").append(title).append("</a>");
        html.append("</body></html>");
        return html.toString();
    }

    private String absoluteUrl(HttpServletRequest request, String path) {
        String baseUrl = publicBaseUrl.isBlank() ? requestBaseUrl(request) : publicBaseUrl;
        return trimTrailingSlash(baseUrl) + path;
    }

    private String requestBaseUrl(HttpServletRequest request) {
        String forwardedProto = firstForwardedValue(request.getHeader("X-Forwarded-Proto"));
        String forwardedHost = firstForwardedValue(request.getHeader("X-Forwarded-Host"));
        String proto = forwardedProto == null || forwardedProto.isBlank()
                ? (request.isSecure() ? "https" : request.getScheme())
                : forwardedProto;
        String host = forwardedHost == null || forwardedHost.isBlank() ? request.getHeader("Host") : forwardedHost;
        if (host == null || host.isBlank()) {
            host = request.getServerName();
            int port = request.getServerPort();
            if (port > 0 && !isDefaultPort(proto, port)) {
                host += ":" + port;
            }
        }
        return proto + "://" + host;
    }

    private String firstForwardedValue(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.split(",")[0].trim();
    }

    private boolean isDefaultPort(String scheme, int port) {
        return ("http".equalsIgnoreCase(scheme) && port == 80)
                || ("https".equalsIgnoreCase(scheme) && port == 443);
    }

    private String trimTrailingSlash(String value) {
        if (value.endsWith("/")) {
            return value.substring(0, value.length() - 1);
        }
        return value;
    }

    private String html(String value) {
        return HtmlUtils.htmlEscape(value == null ? "" : value, StandardCharsets.UTF_8.name());
    }

    private record CommunityShareData(Long id,
                                      String title,
                                      String description,
                                      String url,
                                      String imageUrl,
                                      boolean hasImage) {}

    private String filenameOrFallback(String originalName, String mimeType, String fallbackBase) {
        if (originalName != null && !originalName.isBlank()) {
            return originalName;
        }
        return fallbackBase + extensionFor(mimeType);
    }

    private String extensionFor(String mimeType) {
        if (mimeType == null) return "";
        return switch (mimeType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            case "video/mp4" -> ".mp4";
            case "video/webm" -> ".webm";
            case "video/quicktime" -> ".mov";
            case "application/zip", "application/x-zip-compressed" -> ".zip";
            default -> "";
        };
    }

    private static String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (TRUSTED_PROXIES.contains(remoteAddr)) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                String candidate = forwarded.split(",")[0].trim();
                if (isValidIp(candidate)) return candidate;
            }
            String realIp = request.getHeader("X-Real-IP");
            if (realIp != null && !realIp.isBlank() && isValidIp(realIp.trim())) {
                return realIp.trim();
            }
        }
        return remoteAddr;
    }

    private static boolean isValidIp(String ip) {
        if (ip == null || ip.length() > 45) return false;
        try {
            java.net.InetAddress.getByName(ip);
            return !ip.contains(" ");
        } catch (java.net.UnknownHostException e) {
            return false;
        }
    }
}
