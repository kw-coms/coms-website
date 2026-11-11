package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.AskRequest;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.SlidingWindowRateLimiter;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.Duration;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

@Service
public class AskService {
    private static final Logger log = LoggerFactory.getLogger(AskService.class);
    private static final String RATE_MESSAGE = "질문 요청이 많습니다. 잠시 후 다시 시도해주세요.";
    private static final DateTimeFormatter KST_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm '(KST)'")
            .withZone(ZoneId.of("Asia/Seoul"));

    private final SiteSettingsService siteSettingsService;
    private final MemberRepository memberRepository;
    private final JavaMailSender mailSender;
    private final Clock clock;
    private final boolean mailEnabled;
    private final String from;
    private final SlidingWindowRateLimiter shortLimit;
    private final SlidingWindowRateLimiter dailyLimit;
    private final SlidingWindowRateLimiter globalLimit;
    private final SlidingWindowRateLimiter globalDailyLimit;

    @Autowired
    public AskService(SiteSettingsService siteSettingsService, MemberRepository memberRepository,
                      JavaMailSender mailSender, Clock clock,
                      @Value("${mail.enabled:false}") boolean mailEnabled,
                      @Value("${mail.from:}") String from,
                      @Value("${ask.global-daily-limit:60}") int globalDailyLimit) {
        this.siteSettingsService = siteSettingsService;
        this.memberRepository = memberRepository;
        this.mailSender = mailSender;
        this.clock = clock;
        this.mailEnabled = mailEnabled;
        this.from = from;
        shortLimit = new SlidingWindowRateLimiter(3, Duration.ofMinutes(10), clock);
        dailyLimit = new SlidingWindowRateLimiter(10, Duration.ofDays(1), clock);
        globalLimit = new SlidingWindowRateLimiter(30, Duration.ofHours(1), clock);
        this.globalDailyLimit = new SlidingWindowRateLimiter(globalDailyLimit, Duration.ofDays(1), clock);
    }

    AskService(SiteSettingsService siteSettingsService, MemberRepository memberRepository,
               JavaMailSender mailSender, Clock clock, boolean mailEnabled, String from) {
        this(siteSettingsService, memberRepository, mailSender, clock, mailEnabled, from, 60);
    }

    public void send(AskRequest request, Authentication authentication, String clientIp) {
        if (request != null && request.honeypot() != null && !request.honeypot().isEmpty()) return;
        String inbox = siteSettingsService.askInboxEmail();
        if (!mailEnabled || !AskEmailAddress.isValid(inbox) || !AskEmailAddress.isValid(from)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "질문 받기가 현재 꺼져 있습니다.");
        }
        if (request == null) {
            throw invalid();
        }
        String question = trimmed(request.question());
        if (question.length() < 5 || question.length() > 2000) throw invalid();
        String name = trimmed(request.name());
        if (name.length() > 60 || hasControl(name)) throw invalid();
        String path = validPath(request.pagePath());

        Member member = null;
        if (authentication != null && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken)) {
            member = memberRepository.findByStudentId(authentication.getName())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        }
        String rawReply = request.replyEmail();
        if (rawReply != null && hasControl(rawReply)) throw invalid();
        String reply = trimmed(rawReply);
        if (reply.isEmpty() && member != null) reply = member.getEmail();
        if (!AskEmailAddress.isValid(reply)) throw invalid();

        String ipKey = "ip:" + clientIp;
        String memberKey = member == null ? null : "member:" + member.getId();
        synchronized (this) {
            if (shortLimit.isExhausted(ipKey) || dailyLimit.isExhausted(ipKey)
                    || (memberKey != null && (shortLimit.isExhausted(memberKey) || dailyLimit.isExhausted(memberKey)))
                    || globalLimit.isExhausted("site") || globalDailyLimit.isExhausted("site")) throw tooMany();
            shortLimit.record(ipKey);
            dailyLimit.record(ipKey);
            if (memberKey != null) {
                shortLimit.record(memberKey);
                dailyLimit.record(memberKey);
            }
            globalLimit.record("site");
            globalDailyLimit.record("site");
        }

        String title = question.codePoints()
                .filter(codePoint -> !Character.isISOControl(codePoint))
                .limit(40)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
        String body = "답장 주소: " + reply
                + "\n로그인 회원: " + (member == null ? "아니요" : "예")
                + (member == null ? (name.isEmpty() ? "" : "\n이름: " + name)
                : "\n이름: " + member.getName() + "\n학번: " + member.getStudentId())
                + "\n질문 페이지: " + path + "\n접수 시각: " + KST_TIME.format(clock.instant())
                + "\n\n[질문]\n" + question + "\n";

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(inbox);
        message.setReplyTo(reply);
        message.setSubject("[COM's 질문] " + title);
        message.setText(body);
        try {
            mailSender.send(message);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
        log.info("Question sent");
    }

    private static String validPath(String value) {
        if (value == null || value.length() > 200 || !value.startsWith("/")
                || value.startsWith("//") || hasControl(value) || value.indexOf('\\') >= 0) throw invalid();
        try {
            URI uri = new URI(value);
            String decoded = uri.getPath();
            if (uri.getScheme() != null || uri.getRawAuthority() != null || uri.getRawQuery() != null
                    || uri.getRawFragment() != null || decoded == null || decoded.startsWith("//")
                    || decoded.indexOf('\\') >= 0 || decoded.indexOf('%') >= 0
                    || hasControl(decoded)) throw invalid();
            return value;
        } catch (URISyntaxException ex) {
            throw invalid();
        }
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean hasControl(String value) {
        return value.chars().anyMatch(Character::isISOControl);
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "입력값을 확인해주세요.");
    }

    private static ResponseStatusException tooMany() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, RATE_MESSAGE);
    }
}
