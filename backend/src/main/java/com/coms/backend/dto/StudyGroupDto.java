package com.coms.backend.dto;

import com.coms.backend.domain.StudyGroup;
import com.coms.backend.domain.StudyGroupMember;
import com.coms.backend.domain.StudyInterest;
import io.swagger.v3.oas.annotations.media.Schema;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class StudyGroupDto {
    private StudyGroupDto() {}
    @Schema(name = "StudyGroupWrite")
    public record Write(String name, String description, List<String> topicTags, String term,
                        String schedule, String place, Integer capacity, @Size(max = 50) String leaderStudentId) {}
    @Schema(name = "StudyGroupCard")
    public record Card(Long id, String name, List<String> topicTags, String schedule, String leaderName,
                       StudyGroup.Status status, @JsonInclude(JsonInclude.Include.NON_NULL) Long interestCount) {}
    @Schema(name = "StudyGroupMemberView")
    public record MemberView(String studentId, String name, StudyGroupMember.Role role,
                             StudyGroupMember.Status status, LocalDateTime joinedAt) {}
    @Schema(name = "StudyInterestWrite")
    public record InterestWrite(List<String> slots, StudyInterest.Level level) {}
    @Schema(name = "StudyInterestOwn")
    public record InterestOwn(List<String> slots, StudyInterest.Level level) {}
    @Schema(name = "StudyInterestName")
    public record InterestName(String studentId, String name) {}
    @Schema(name = "StudyInterestSummary")
    public record InterestSummary(long total, Map<String, Long> slots,
                                  Map<String, Long> levels, List<InterestName> names) {}
    @Schema(name = "StudyGroupView")
    public record View(Long id, String name, String description, List<String> topicTags,
                       @Schema(types = {"string", "null"}) String leaderStudentId, String leaderName,
                       String term, String schedule, String place,
                       Integer capacity, StudyGroup.Status status, String createdBy,
                       LocalDateTime createdAt, LocalDateTime updatedAt, long interestCount,
                       InterestSummary interestSummary, MemberView myMembership,
                       InterestOwn myInterest, boolean manager) {}
    @Schema(name = "StudyGroupLeaderWrite")
    public record LeaderWrite(@NotBlank @Size(max = 50) String studentId) {}
    @Schema(name = "StudyGroupMembershipDecision")
    public record MembershipDecision(@NotNull Boolean approved) {}
}
