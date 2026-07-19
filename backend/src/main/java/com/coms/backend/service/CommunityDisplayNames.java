package com.coms.backend.service;

/**
 * Derives the community display name for a member from their student id. The name is prefixed with
 * the member's admission "generation" (기) so lists and detail views read consistently. Pure and
 * stateless: shared by post and comment rendering without pulling in the wider CommunityService.
 */
final class CommunityDisplayNames {
    private CommunityDisplayNames() {}

    static String displayName(String studentId, String name) {
        String trimmedName = name == null ? "" : name.trim();
        String generation = generationFromStudentId(studentId);
        return generation.isBlank() ? trimmedName : generation + " " + trimmedName;
    }

    static String generationFromStudentId(String studentId) {
        if (studentId == null || !studentId.matches("\\d{10}")) {
            return "";
        }
        int admissionYear = Integer.parseInt(studentId.substring(0, 4));
        int generation = admissionYear - 1966;
        return generation > 0 ? generation + "기" : "";
    }
}
