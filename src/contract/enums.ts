/**
 * generated from coms-shared-contract — do not edit by hand
 *
 * Source of truth: https://github.com/choijunhuk/coms-shared-contract (enums.js)
 * Vendored commit: 44c6cbcbf4b176ebf49037b6195ff6ad38aebdb2
 *
 * To sync: copy enums.js from the coms-shared-contract repo into this file,
 * keeping this header. We vendor (instead of a `github:` npm dependency)
 * because the production frontend builds in node:24-alpine (Dockerfile.frontend),
 * which has no `git` binary and therefore cannot resolve a git dependency
 * during `npm ci`.
 *
 * Canonical enum values sourced directly from the Spring Boot backend domain
 * classes (backend/src/main/java/com/coms/backend/domain/):
 *   ArchiveFile.java    → ArchiveCategory
 *   CommunityPost.java  → CommunityCategory
 *   Notice.java         → NoticeCategory
 *   ClubActivity.java   → ActivityCategory, ActivityKind
 *   Member.java         → MemberRole
 */

// ArchiveFile.Category
export const ArchiveCategory = /** @type {const} */ ({
  GENERAL: "GENERAL",
  ACADEMIC_JOURNAL: "ACADEMIC_JOURNAL",
});

// CommunityPost.Category
export const CommunityCategory = /** @type {const} */ ({
  GENERAL: "GENERAL",
  QUESTION: "QUESTION",
  INFO: "INFO",
  ANONYMOUS: "ANONYMOUS",
});

// Notice.Category
export const NoticeCategory = /** @type {const} */ ({
  GENERAL: "GENERAL",
  PROMOTION: "PROMOTION",
  SMALL_GROUP: "SMALL_GROUP",
  JOB: "JOB",
});

// ClubActivity.Category
export const ActivityCategory = /** @type {const} */ ({
  GENERAL: "GENERAL",
  SEMINAR: "SEMINAR",
  STUDY: "STUDY",
  PROJECT: "PROJECT",
  MEETING: "MEETING",
  RECRUIT: "RECRUIT",
  EVENT: "EVENT",
  MT: "MT",
  ACHIEVEMENT: "ACHIEVEMENT",
});

// ClubActivity.Kind
export const ActivityKind = /** @type {const} */ ({
  ACTIVITY: "ACTIVITY",
  SCHEDULE: "SCHEDULE",
});

// Member.Role
export const MemberRole = /** @type {const} */ ({
  USER: "USER",
  ADMIN: "ADMIN",
});
