package com.coms.backend.service;

import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.RecruitApplicationRepository;
import com.coms.backend.repository.RecruitPromotionLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/**
 * Removes personal data once the purpose it was collected for is over (개인정보 보유기간 경과 후
 * 파기). Nightly, after {@link LoginFailureRetentionJob}.
 *
 * <ul>
 *   <li>Audit log client addresses — the action itself stays on record.</li>
 *   <li>The address an application was submitted from — only the per-address limits use it.</li>
 *   <li>Applications nobody decided on — decided ones are already removed when they are decided.</li>
 *   <li>Phone numbers and e-mail addresses in the decision log — the decision itself stays.</li>
 * </ul>
 *
 * <p>Every period is configurable ({@code coms.retention.*}); the defaults are a starting point
 * for the club to confirm, not legal advice.
 */
@Service
public class PersonalDataRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(PersonalDataRetentionJob.class);

    private final AuditLogRepository auditLogRepository;
    private final RecruitApplicationRepository recruitApplicationRepository;
    private final RecruitPromotionLogRepository promotionLogRepository;
    private final Clock clock;
    private final boolean enabled;
    private final int auditIpDays;
    private final int applicationIpDays;
    private final int applicationDays;
    private final int decisionContactDays;

    public PersonalDataRetentionJob(AuditLogRepository auditLogRepository,
                                    RecruitApplicationRepository recruitApplicationRepository,
                                    RecruitPromotionLogRepository promotionLogRepository,
                                    Clock clock,
                                    @Value("${coms.retention.enabled:true}") boolean enabled,
                                    @Value("${coms.retention.audit-ip-days:180}") int auditIpDays,
                                    @Value("${coms.retention.recruit-application-ip-days:30}") int applicationIpDays,
                                    @Value("${coms.retention.recruit-application-days:365}") int applicationDays,
                                    @Value("${coms.retention.recruit-decision-contact-days:365}") int decisionContactDays) {
        this.auditLogRepository = auditLogRepository;
        this.recruitApplicationRepository = recruitApplicationRepository;
        this.promotionLogRepository = promotionLogRepository;
        this.clock = clock;
        this.enabled = enabled;
        this.auditIpDays = requirePositive(auditIpDays, "audit-ip-days");
        this.applicationIpDays = requirePositive(applicationIpDays, "recruit-application-ip-days");
        this.applicationDays = requirePositive(applicationDays, "recruit-application-days");
        this.decisionContactDays = requirePositive(decisionContactDays, "recruit-decision-contact-days");
    }

    @Scheduled(cron = "${coms.retention.personal-data-cron:0 10 5 * * *}", zone = "Asia/Seoul")
    @Transactional
    public void purge() {
        if (!enabled) {
            log.debug("Retention purge disabled (coms.retention.enabled=false) — skipping.");
            return;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        int auditIps = auditLogRepository.clearIpAddressesBefore(now.minusDays(auditIpDays));
        int applicationIps = recruitApplicationRepository.clearClientIpsBefore(now.minusDays(applicationIpDays));
        int applications = recruitApplicationRepository.deleteSubmittedBefore(now.minusDays(applicationDays));
        int decisionContacts = promotionLogRepository.clearContactDetailsBefore(now.minusDays(decisionContactDays));
        log.info("Personal data retention: cleared {} audit IPs, {} application IPs, {} decision contacts; deleted {} stale applications",
                auditIps, applicationIps, decisionContacts, applications);
    }

    private static int requirePositive(int days, String name) {
        if (days < 1) {
            throw new IllegalArgumentException("coms.retention." + name + " must be at least 1 day");
        }
        return days;
    }
}
