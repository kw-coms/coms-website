package com.coms.backend.service;

/**
 * Derives the community display name for a member from their student id. The name is prefixed with
 * the member's admission "generation" (기) so lists and detail views read consistently. Pure and
 * stateless: shared by post and comment rendering without pulling in the wider CommunityService.
 */
final class CommunityDisplayNames {
    private CommunityDisplayNames() {}

    static String displayName(String studentId, String name) {
        return displayName(null, studentId, name);
    }

    /**
     * Preferred overload: {@code generation} is the member's stored 기수 (editable, source of
     * truth since 편입생 학번 연도 ≠ 기수). Falls back to the studentId-derived value for
     * members created before the column existed or when no member row is available.
     */
    static String displayName(String generation, String studentId, String name) {
        String trimmedName = name == null ? "" : name.trim();
        String label = generationLabel(generation, studentId);
        return label.isBlank() ? trimmedName : label + " " + trimmedName;
    }

    static String generationLabel(String generation, String studentId) {
        String stored = generation == null ? "" : generation.trim();
        if (stored.matches("\\d{1,3}")) {
            return stored + "기";
        }
        return generationFromStudentId(studentId);
    }

    static String generationFromStudentId(String studentId) {
        Integer admissionYear = admissionYearFromStudentId(studentId);
        if (admissionYear == null) {
            return "";
        }
        int generation = admissionYear - 1966;
        return generation > 0 ? generation + "기" : "";
    }

    /**
     * Admission year from either id shape: a 10-digit 학번 (year = first four
     * digits) or a graduate synthetic id "G{year}-{rosterId}" minted at
     * graduate signup — without this, graduates showed a bare name (and their
     * raw G-id leaked wherever the id itself is displayed).
     */
    private static Integer admissionYearFromStudentId(String studentId) {
        if (studentId == null) {
            return null;
        }
        if (studentId.matches("\\d{10}")) {
            return Integer.parseInt(studentId.substring(0, 4));
        }
        if (studentId.matches("G\\d{4}-\\d+")) {
            return Integer.parseInt(studentId.substring(1, 5));
        }
        return null;
    }
}
