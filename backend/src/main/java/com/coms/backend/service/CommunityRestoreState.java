package com.coms.backend.service;

import com.coms.backend.domain.CommunityPollVote;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostBookmark;
import com.coms.backend.domain.CommunityPostVote;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * What restoring a deleted post needs beyond the visible deletion snapshot: the post's anonymous
 * nickname and tag, its pin, the author-name override, and who voted on it, bookmarked it and
 * answered its polls. Deleting a post removes all of these, so without this record a restored
 * post came back with a different anonymous nickname, no votes, no bookmarks and empty polls.
 *
 * <p>Kept as JSON in {@code deleted_community_posts.restore_state}. It names other members by
 * 학번, so it is read only by the restore and is never mapped into a response.
 */
record CommunityRestoreState(String anonymousName,
                             String ipAddress,
                             boolean pinned,
                             LocalDateTime pinnedAt,
                             boolean authorNameOverridden,
                             List<Vote> votes,
                             List<Bookmark> bookmarks,
                             List<PollVote> pollVotes) {

    private static final ObjectMapper JSON = new ObjectMapper();

    record Vote(String studentId, int value, LocalDateTime createdAt, LocalDateTime updatedAt) {}

    record Bookmark(String studentId, LocalDateTime createdAt) {}

    record PollVote(String pollId, String studentId, int optionIndex, LocalDateTime createdAt, LocalDateTime updatedAt) {}

    static CommunityRestoreState capture(CommunityPost post,
                                         List<CommunityPostVote> votes,
                                         List<CommunityPostBookmark> bookmarks,
                                         List<CommunityPollVote> pollVotes) {
        return new CommunityRestoreState(
                post.getAnonymousName(),
                post.getIpAddress(),
                post.isPinned(),
                post.getPinnedAt(),
                post.isAuthorNameOverridden(),
                votes.stream()
                        .map(vote -> new Vote(vote.getStudentId(), vote.getValue(), vote.getCreatedAt(), vote.getUpdatedAt()))
                        .toList(),
                bookmarks.stream()
                        .map(bookmark -> new Bookmark(bookmark.getStudentId(), bookmark.getCreatedAt()))
                        .toList(),
                pollVotes.stream()
                        .map(vote -> new PollVote(vote.getPollId(), vote.getStudentId(), vote.getOptionIndex(),
                                vote.getCreatedAt(), vote.getUpdatedAt()))
                        .toList());
    }

    String toJson() {
        ObjectNode root = JSON.createObjectNode();
        root.put("version", 1);
        putText(root, "anonymousName", anonymousName);
        putText(root, "ipAddress", ipAddress);
        root.put("pinned", pinned);
        putTime(root, "pinnedAt", pinnedAt);
        root.put("authorNameOverridden", authorNameOverridden);
        ArrayNode voteNodes = root.putArray("votes");
        for (Vote vote : votes) {
            ObjectNode node = voteNodes.addObject();
            node.put("studentId", vote.studentId());
            node.put("value", vote.value());
            putTime(node, "createdAt", vote.createdAt());
            putTime(node, "updatedAt", vote.updatedAt());
        }
        ArrayNode bookmarkNodes = root.putArray("bookmarks");
        for (Bookmark bookmark : bookmarks) {
            ObjectNode node = bookmarkNodes.addObject();
            node.put("studentId", bookmark.studentId());
            putTime(node, "createdAt", bookmark.createdAt());
        }
        ArrayNode pollVoteNodes = root.putArray("pollVotes");
        for (PollVote vote : pollVotes) {
            ObjectNode node = pollVoteNodes.addObject();
            node.put("pollId", vote.pollId());
            node.put("studentId", vote.studentId());
            node.put("optionIndex", vote.optionIndex());
            putTime(node, "createdAt", vote.createdAt());
            putTime(node, "updatedAt", vote.updatedAt());
        }
        return root.toString();
    }

    /**
     * @return {@code null} for a snapshot taken before this record existed (or one that cannot be
     *         read): the restore then behaves as it always did.
     */
    static CommunityRestoreState parse(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            JsonNode root = JSON.readTree(json);
            if (!root.isObject()) {
                return null;
            }
            List<Vote> votes = new ArrayList<>();
            for (JsonNode node : root.path("votes")) {
                String studentId = text(node, "studentId");
                if (studentId != null) {
                    votes.add(new Vote(studentId, node.path("value").asInt(0), time(node, "createdAt"), time(node, "updatedAt")));
                }
            }
            List<Bookmark> bookmarks = new ArrayList<>();
            for (JsonNode node : root.path("bookmarks")) {
                String studentId = text(node, "studentId");
                if (studentId != null) {
                    bookmarks.add(new Bookmark(studentId, time(node, "createdAt")));
                }
            }
            List<PollVote> pollVotes = new ArrayList<>();
            for (JsonNode node : root.path("pollVotes")) {
                String pollId = text(node, "pollId");
                String studentId = text(node, "studentId");
                if (pollId != null && studentId != null && node.path("optionIndex").canConvertToInt()) {
                    pollVotes.add(new PollVote(pollId, studentId, node.path("optionIndex").asInt(),
                            time(node, "createdAt"), time(node, "updatedAt")));
                }
            }
            return new CommunityRestoreState(
                    text(root, "anonymousName"),
                    text(root, "ipAddress"),
                    root.path("pinned").asBoolean(false),
                    time(root, "pinnedAt"),
                    root.path("authorNameOverridden").asBoolean(false),
                    List.copyOf(votes),
                    List.copyOf(bookmarks),
                    List.copyOf(pollVotes));
        } catch (Exception unreadable) {
            return null;
        }
    }

    private static void putText(ObjectNode node, String field, String value) {
        if (value != null) {
            node.put(field, value);
        }
    }

    private static void putTime(ObjectNode node, String field, LocalDateTime value) {
        if (value != null) {
            node.put(field, value.toString());
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
    }

    private static LocalDateTime time(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null) {
            return null;
        }
        try {
            return LocalDateTime.parse(value);
        } catch (DateTimeParseException malformed) {
            return null;
        }
    }
}
