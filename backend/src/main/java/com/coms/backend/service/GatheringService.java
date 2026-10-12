package com.coms.backend.service;

import com.coms.backend.domain.Gathering;
import com.coms.backend.domain.GatheringSignup;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.GatheringDetailResponse;
import com.coms.backend.dto.GatheringRequest;
import com.coms.backend.dto.GatheringResponse;
import com.coms.backend.repository.GatheringRepository;
import com.coms.backend.repository.GatheringSignupRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Gatherings ("모임 신청"): any signed-in member opens one for a study, an outing or a dinner,
 * other members put their names down while it is open, and everyone sees who is coming.
 * Members only; other members see names, never student ids. What a member writes in answer to
 * the gathering's question is shown to whoever may manage it and to that member.
 *
 * <p>Club events keep their own 참석/미정/불참 count; this is the list with a limit and names.
 */
@Service
@Transactional
public class GatheringService {
    static final int MAX_GATHERINGS_PER_MEMBER = 20;
    private static final int MAX_DAYS_AHEAD = 366;

    private final GatheringRepository gatheringRepository;
    private final GatheringSignupRepository signupRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    public GatheringService(GatheringRepository gatheringRepository,
                            GatheringSignupRepository signupRepository,
                            MemberRepository memberRepository,
                            Clock clock) {
        this.gatheringRepository = gatheringRepository;
        this.signupRepository = signupRepository;
        this.memberRepository = memberRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<GatheringResponse> list(String studentId) {
        Member member = requireMember(studentId);
        List<Gathering> gatherings = gatheringRepository.findTop100ByOrderByCreatedAtDescIdDesc();
        if (gatherings.isEmpty()) return List.of();
        Map<Long, List<GatheringSignup>> byGathering = signupRepository
                .findByGatheringIdIn(gatherings.stream().map(Gathering::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(GatheringSignup::getGatheringId));
        LocalDateTime now = LocalDateTime.now(clock);
        return gatherings.stream()
                .map(gathering -> toResponse(gathering, byGathering.getOrDefault(gathering.getId(), List.of()), member, now))
                .toList();
    }

    @Transactional(readOnly = true)
    public GatheringDetailResponse get(Long id, String studentId) {
        Member member = requireMember(studentId);
        return toDetail(requireGathering(id), member);
    }

    public GatheringDetailResponse create(GatheringRequest request, String studentId) {
        Member member = requireMember(studentId);
        if (gatheringRepository.countByCreatorStudentId(member.getStudentId()) >= MAX_GATHERINGS_PER_MEMBER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "만들 수 있는 모임은 " + MAX_GATHERINGS_PER_MEMBER + "개까지입니다. 지난 것을 지운 뒤 다시 만들어 주세요.");
        }
        String title = request.title() == null ? "" : request.title().trim();
        if (title.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "제목을 입력해 주세요.");
        }
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime closesAt = request.closesAt();
        if (closesAt != null && (!closesAt.isAfter(now) || closesAt.isAfter(now.plusDays(MAX_DAYS_AHEAD)))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "마감 시각은 지금부터 1년 안으로 정해 주세요.");
        }

        Gathering gathering = new Gathering();
        gathering.setTitle(title);
        gathering.setDescription(blankToNull(request.description()));
        gathering.setCapacity(request.capacity());
        gathering.setNoteLabel(blankToNull(request.noteLabel()));
        gathering.setClosesAt(closesAt);
        gathering.setCreatorStudentId(member.getStudentId());
        gathering.setCreatorName(displayName(member));
        gathering.setCreatedAt(now);
        return toDetail(gatheringRepository.save(gathering), member);
    }

    /**
     * Puts the member's name down. Signing up again while the gathering is open only replaces
     * what they wrote. The gathering is locked for the length of the transaction, so the last
     * place of a limited one goes to one member.
     */
    public GatheringDetailResponse join(Long id, String studentId, String rawNote) {
        Member member = requireMember(studentId);
        Gathering gathering = gatheringRepository.findByIdForUpdate(id).orElseThrow(GatheringService::gatheringNotFound);
        LocalDateTime now = LocalDateTime.now(clock);
        if (!gathering.isOpenAt(now)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "마감된 모임입니다.");
        }
        // An answer is kept only when the gathering asks a question.
        String note = gathering.getNoteLabel() == null ? null : blankToNull(rawNote);
        GatheringSignup signup = signupRepository.findByGatheringIdAndStudentId(gathering.getId(), member.getStudentId()).orElse(null);
        if (signup == null) {
            if (gathering.getCapacity() != null && signupRepository.countByGatheringId(gathering.getId()) >= gathering.getCapacity()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "정원이 찼습니다.");
            }
            signup = new GatheringSignup();
            signup.setGatheringId(gathering.getId());
            signup.setStudentId(member.getStudentId());
            signup.setCreatedAt(now);
        }
        signup.setMemberName(displayName(member));
        signup.setNote(note);
        signupRepository.saveAndFlush(signup);
        return toDetail(gathering, member);
    }

    /** Takes the member's name off, while the gathering is open. Not being on it changes nothing. */
    public GatheringDetailResponse leave(Long id, String studentId) {
        Member member = requireMember(studentId);
        Gathering gathering = requireGathering(id);
        if (!gathering.isOpenAt(LocalDateTime.now(clock))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "마감된 모임은 취소할 수 없습니다. 연 사람에게 알려 주세요.");
        }
        signupRepository.deleteByGatheringIdAndStudentId(gathering.getId(), member.getStudentId());
        signupRepository.flush();
        return toDetail(gathering, member);
    }

    /** Whoever may manage the gathering takes one name off it, open or closed. */
    public GatheringDetailResponse removeSignup(Long id, Long signupId, String studentId) {
        Member member = requireMember(studentId);
        Gathering gathering = requireManagedGathering(id, member);
        GatheringSignup signup = signupRepository.findById(signupId)
                .filter(found -> found.getGatheringId().equals(gathering.getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "신청 내역을 찾을 수 없습니다."));
        signupRepository.delete(signup);
        signupRepository.flush();
        return toDetail(gathering, member);
    }

    /** Stops sign-up now. Closing a gathering that is already over changes nothing. */
    public GatheringDetailResponse close(Long id, String studentId) {
        Member member = requireMember(studentId);
        Gathering gathering = requireManagedGathering(id, member);
        LocalDateTime now = LocalDateTime.now(clock);
        if (gathering.isOpenAt(now)) {
            gathering.setClosedAt(now);
            gatheringRepository.save(gathering);
        }
        return toDetail(gathering, member);
    }

    public void delete(Long id, String studentId) {
        Member member = requireMember(studentId);
        Gathering gathering = requireManagedGathering(id, member);
        signupRepository.deleteByGatheringId(gathering.getId());
        gatheringRepository.delete(gathering);
    }

    /**
     * Called when a member's account is removed: their names on every gathering, and the
     * gatherings they opened (with the names on them), go with the account.
     */
    public void deleteDataForMember(String studentId) {
        if (studentId == null || studentId.isBlank()) return;
        signupRepository.deleteByStudentId(studentId);
        for (Gathering gathering : gatheringRepository.findByCreatorStudentId(studentId)) {
            signupRepository.deleteByGatheringId(gathering.getId());
            gatheringRepository.delete(gathering);
        }
    }

    private Member requireMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
    }

    private Gathering requireGathering(Long id) {
        return gatheringRepository.findById(id).orElseThrow(GatheringService::gatheringNotFound);
    }

    private Gathering requireManagedGathering(Long id, Member member) {
        Gathering gathering = requireGathering(id);
        if (!canManage(gathering, member)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "이 모임을 관리할 권한이 없습니다.");
        }
        return gathering;
    }

    private static ResponseStatusException gatheringNotFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "모임을 찾을 수 없습니다.");
    }

    /** The member who opened a gathering, or the president, manages it. */
    private static boolean canManage(Gathering gathering, Member member) {
        return gathering.getCreatorStudentId().equals(member.getStudentId()) || member.getRole() == Member.Role.ADMIN;
    }

    private static String displayName(Member member) {
        String name = member.getName() == null ? "" : member.getName().trim();
        return name.isEmpty() ? "회원" : name;
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private GatheringResponse toResponse(Gathering gathering, List<GatheringSignup> signups, Member member, LocalDateTime now) {
        return new GatheringResponse(
                gathering.getId(),
                gathering.getTitle(),
                gathering.getDescription(),
                gathering.getCreatorName(),
                gathering.getCreatorStudentId().equals(member.getStudentId()),
                canManage(gathering, member),
                gathering.getCapacity(),
                gathering.getNoteLabel(),
                gathering.getClosesAt(),
                gathering.isOpenAt(now),
                gathering.getCapacity() != null && signups.size() >= gathering.getCapacity(),
                signups.size(),
                signups.stream().anyMatch(signup -> signup.getStudentId().equals(member.getStudentId())),
                gathering.getCreatedAt()
        );
    }

    private GatheringDetailResponse toDetail(Gathering gathering, Member member) {
        List<GatheringSignup> signups = signupRepository.findByGatheringIdOrderByCreatedAtAscIdAsc(gathering.getId());
        boolean manager = canManage(gathering, member);
        return new GatheringDetailResponse(
                toResponse(gathering, signups, member, LocalDateTime.now(clock)),
                signups.stream()
                        .map(signup -> {
                            boolean mine = signup.getStudentId().equals(member.getStudentId());
                            return new GatheringDetailResponse.GatheringParticipant(
                                    signup.getId(),
                                    signup.getMemberName(),
                                    mine,
                                    manager || mine ? signup.getNote() : null,
                                    signup.getCreatedAt());
                        })
                        .toList());
    }
}
