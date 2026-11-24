# Archive permissions verification

Verified locally on 2026-11-24 in `coms-wt-archive`, branch `feat/archive-permissions`.
No push, SSH, system-setting changes, or new dependencies. No `study_group_id` column.

## Result and policy

- Per-file visibility: `PUBLIC`, `MEMBERS` (default), `OFFICERS`, `SELECTED`.
- `MEMBERS` intentionally preserves existing access for every real signed-in member, including `ASSOCIATE`. The old SecurityConfig required authentication, not USER rank.
- `OFFICERS` permits OFFICER, VICE_PRESIDENT and ADMIN. `SELECTED` permits named student IDs, the current uploader and ADMIN.
- Management grants do not imply visibility. Hidden single-file reads return 404. Anonymous voting and mobile home remain authenticated endpoints and return 401, regardless of file existence.
- Owners retain basic visibility changes and their own edit/delete actions. OFFICERS/SELECTED require `archive.visibility`. Ownership reassignment retains the existing ADMIN-only restriction; author display-name changes use `archive.author_change`.
- Recipients are returned only to the uploader or a visibility manager, not other selected readers. Member lookup returns only name, student ID and role.
- The browser denies unknown permission sets, and discards private archive state when the account or role changes.

## Local code commits

- `6a22b4d5` Server authorization, migrations and OpenAPI.
- `f5f808dc` Effective client permissions and request contracts.
- `6bc7f03e` Archive/admin UI and browser regression coverage.

## Migrations

| Version | Result |
| --- | --- |
| V124 `archive_permissions_and_member_overrides` | Copies each legacy archive.manage role grant/denial, timestamp and updater to archive.delete, archive.author_change, archive.edit_any and archive.visibility, then deletes the legacy key. Creates member_permission_overrides with unique student/key and GRANT/REVOKE validation. |
| V125 `archive_visibility` | Adds NOT NULL visibility DEFAULT MEMBERS and the selected-member join table with foreign keys and cascading cleanup. Existing and newly inserted legacy-format rows default to MEMBERS. |

Both SQL migrations run through Flyway in isolated H2 PostgreSQL-mode fixtures. The complete migration chain and Hibernate validation also passed against an isolated PostgreSQL 16 container.

## Guarded read paths

Paths below are relative to the repository. The shared single-row policy is `backend/src/main/java/com/coms/backend/domain/ArchiveFile.java:99`.

| Read surface | Entry point | Enforcement |
| --- | --- | --- |
| GET /api/files, including optional page/size | backend/src/main/java/com/coms/backend/controller/ArchiveController.java:79 | backend/src/main/java/com/coms/backend/service/ArchiveService.java:290; backend/src/main/java/com/coms/backend/repository/ArchiveFileRepository.java:20 filters visibility in SQL before pagination. |
| GET /api/files/{id} | backend/src/main/java/com/coms/backend/controller/ArchiveController.java:87 | backend/src/main/java/com/coms/backend/service/ArchiveService.java:318 checks visibility under a row lock before incrementing views and returning the DTO. |
| GET /api/files/{id}/download | backend/src/main/java/com/coms/backend/controller/ArchiveController.java:136 | backend/src/main/java/com/coms/backend/service/ArchiveService.java:312 checks the viewer before storage access. |
| GET /api/files/{id}/inline | backend/src/main/java/com/coms/backend/controller/ArchiveController.java:168 | Same ArchiveService.get guard, then the existing safe MIME/Content-Disposition rules. |
| GET /api/files/{id}/attachments/{attachmentId}/download | backend/src/main/java/com/coms/backend/controller/ArchiveController.java:152 | backend/src/main/java/com/coms/backend/service/ArchiveService.java:334 checks the parent first, then queries by both attachment ID and parent ID. |
| POST /api/files/{id}/vote | backend/src/main/java/com/coms/backend/controller/ArchiveController.java:129 | backend/src/main/java/com/coms/backend/service/ArchiveService.java:340 checks visibility before votes or the response DTO. |
| GET /api/mobile/v1/home quickFiles | backend/src/main/java/com/coms/backend/controller/MobileController.java:61 | backend/src/main/java/com/coms/backend/controller/MobileController.java:66 passes the actual viewer; backend/src/main/java/com/coms/backend/service/ArchiveService.java:303 filters in SQL before LIMIT. |
| GET /api/rich-media/{id} | backend/src/main/java/com/coms/backend/controller/RichBodyMediaController.java:54 | backend/src/main/java/com/coms/backend/service/RichBodyMediaService.java:134 checks ARCHIVE media against its parent visibility, including guests for PUBLIC. Missing parents return 404. |
| GET /api/rich-media/{id}/download | backend/src/main/java/com/coms/backend/controller/RichBodyMediaController.java:59 | Same parent guard. Pending/detached media retains uploader/ADMIN-only access. |
| Archive search and direct community/notification links | src/pages/Archive.tsx:29; src/pages/admin/archiveFileFilters.ts:42 | Search only consumes the server-filtered file list. Direct links and embedded byte URLs re-enter the guarded endpoints above; no separate archive metadata projection was found in community or notification services. |
| GET /api/files/visibility-members | backend/src/main/java/com/coms/backend/controller/ArchiveController.java:92 | backend/src/main/java/com/coms/backend/service/ArchiveService.java:401 requires effective archive.visibility, bounds results to 20 and requires a two-character query. |

`SecurityConfig.java:174` explicitly permits only the archive GET read routes to reach the service anonymously and keeps writes authenticated. Existing origin, upload validation and rate-limiting code is preserved. Archive blobs and attached archive rich-media responses use private/no-store caching.

All production ArchiveFileRepository usages were checked: file reads route through ArchiveService or RichBodyMediaService. AdminAnalyticsService only exposes an aggregate count behind the existing ADMIN boundary. AdminService only removes member vote rows. Old service read overloads without an explicit actor were removed. Content edit, author change, delete and visibility updates also check visibility before returning metadata or modifying a hidden file.

## Effective permissions and audits

`PermissionService.java:95` consults individual overrides before role grants. `PermissionService.java:176` returns effective permissions for `/api/permissions/me`. ADMIN always receives every permission, including when a REVOKE row is inserted directly in a test.

Only the role matrix is cached. Individual overrides are not cached in the service or JWT, so the same token sees changes on its next request. JWT authentication reloads current member details for each request. Override replacement locks the member and records `MEMBER_PERMISSION_OVERRIDE_UPDATE` with before/after values using the existing audit service. Moderator notification recipients now include effective GRANT/REVOKE decisions too.

## Verification

| Check | Result |
| --- | --- |
| npx tsc --noEmit -p . | PASS |
| npx eslint src | PASS |
| npm run test:unit | PASS: 120 test files, no failures |
| Full ./gradlew test with isolated COMS_PG_TEST_URL | PASS: 1,097 tests, 0 failures, 0 errors, 0 skipped |
| ./gradlew test --tests '*ArchiveVisibilityIntegrationTest' after expanding every attachment visibility case | PASS: 2 tests containing the complete viewer/path matrices |
| V124/V125 fixtures and ADMIN REVOKE regression | PASS; included in the full backend run |
| Targeted Playwright smoke and accessibility | PASS: 25 tests (24 smoke + 1 accessibility), 0 failures |
| PWA_DISABLE=1 npm run build | PASS |
| OpenAPI regeneration from http://127.0.0.1:18082/v3/api-docs | PASS; workflow-normalized comparison matches backend/openapi.json, ignoring servers exactly as CI does |
| git diff --check | PASS |

The backend matrix covers PUBLIC/MEMBERS/OFFICERS/SELECTED for guest, ASSOCIATE, USER, OFFICER, VICE_PRESIDENT, selected member, uploader and ADMIN on list/detail/download/inline/attachment/mobile/vote paths. Rich-media inline/download use the same full matrix. Guest writes remain 401. Tests also cover member override GRANT/REVOKE/reset, non-ADMIN 403, next-request behavior with the same token, audit rows, and ADMIN immunity.

Frontend checks cover all filter/sort modes and secondary attachments; fail-closed permissions; account switch/logout and delayed old responses; selected-recipient serialization; individual permission controls; owner/permission buttons; mobile overflow and 44px actions; guest navigation; upload retry; initial-load blocking; and concurrent edit/upload state preservation.

Independent security review found and repaired stale-row privacy overwrites, retained private state after logout, and visibility-editor permission mismatches. Existing shared helpers and design tokens were reused; duplicate size formatting and actor-less read overloads were removed.

## Remaining limits

No known blocking defect remains in the checked scope. Browser checks use mocked APIs; a complete real-backend browser session and the entire unrelated E2E suite were not run. Production deployment and a physical mobile device were not exercised. The temporary PostgreSQL container and local verification backend were stopped after use.

## Changed files

### Backend implementation and migrations

- `backend/src/main/java/com/coms/backend/config/SecurityConfig.java`
- `backend/src/main/java/com/coms/backend/controller/ArchiveController.java`
- `backend/src/main/java/com/coms/backend/controller/MobileController.java`
- `backend/src/main/java/com/coms/backend/controller/PermissionController.java`
- `backend/src/main/java/com/coms/backend/controller/RichBodyMediaController.java`
- `backend/src/main/java/com/coms/backend/domain/ArchiveFile.java`
- `backend/src/main/java/com/coms/backend/domain/MemberPermissionOverride.java`
- `backend/src/main/java/com/coms/backend/domain/MemberPermissionOverrideId.java`
- `backend/src/main/java/com/coms/backend/domain/Permission.java`
- `backend/src/main/java/com/coms/backend/dto/ArchiveFileResponse.java`
- `backend/src/main/java/com/coms/backend/dto/ArchiveVisibilityUpdateRequest.java`
- `backend/src/main/java/com/coms/backend/dto/MemberPermissionResponse.java`
- `backend/src/main/java/com/coms/backend/dto/MemberPermissionSummary.java`
- `backend/src/main/java/com/coms/backend/dto/MemberPermissionUpdateRequest.java`
- `backend/src/main/java/com/coms/backend/repository/ArchiveFileRepository.java`
- `backend/src/main/java/com/coms/backend/repository/MemberPermissionOverrideRepository.java`
- `backend/src/main/java/com/coms/backend/repository/MemberRepository.java`
- `backend/src/main/java/com/coms/backend/service/ArchiveService.java`
- `backend/src/main/java/com/coms/backend/service/NotificationService.java`
- `backend/src/main/java/com/coms/backend/service/PermissionService.java`
- `backend/src/main/java/com/coms/backend/service/RichBodyMediaService.java`
- `backend/src/main/resources/db/migration/V124__archive_permissions_and_member_overrides.sql`
- `backend/src/main/resources/db/migration/V125__archive_visibility.sql`

### Backend tests

- `backend/src/test/java/com/coms/backend/config/LatestMigrationsSmokeTest.java`
- `backend/src/test/java/com/coms/backend/config/OperationsSecurityIntegrationTest.java`
- `backend/src/test/java/com/coms/backend/config/RolePermissionMatrixTest.java`
- `backend/src/test/java/com/coms/backend/config/SecurityConfigSourceTest.java`
- `backend/src/test/java/com/coms/backend/controller/ArchiveControllerTest.java`
- `backend/src/test/java/com/coms/backend/controller/ArchiveVisibilityIntegrationTest.java`
- `backend/src/test/java/com/coms/backend/controller/MemberPermissionOverrideIntegrationTest.java`
- `backend/src/test/java/com/coms/backend/controller/PermissionControllerTest.java`
- `backend/src/test/java/com/coms/backend/controller/RichBodyMediaControllerIntegrationTest.java`
- `backend/src/test/java/com/coms/backend/service/ArchivePermissionMigrationTest.java`
- `backend/src/test/java/com/coms/backend/service/ArchiveServiceTest.java`
- `backend/src/test/java/com/coms/backend/service/ArchiveVisibilityMigrationTest.java`
- `backend/src/test/java/com/coms/backend/service/ClubActivityServiceTest.java`
- `backend/src/test/java/com/coms/backend/service/ClubEventServiceTest.java`
- `backend/src/test/java/com/coms/backend/service/CommunityServiceAuditLogTest.java`
- `backend/src/test/java/com/coms/backend/service/PermissionServiceTest.java`
- `backend/src/test/java/com/coms/backend/service/PermissionServiceTransactionTest.java`
- `backend/src/test/java/com/coms/backend/service/RichBodyMediaServiceTest.java`

### Frontend implementation

- `src/App.tsx`
- `src/components/archive/ArchiveDetailView.tsx`
- `src/components/archive/ArchiveListView.tsx`
- `src/components/archive/WriteForm.tsx`
- `src/components/archive/archiveUtils.ts`
- `src/contexts/AuthContext.tsx`
- `src/contexts/usePermissions.ts`
- `src/data/homeContent.ts`
- `src/data/tourSteps.ts`
- `src/pages/Archive.tsx`
- `src/pages/admin/AdminFiles.tsx`
- `src/pages/admin/AdminPermissions.tsx`
- `src/pages/admin/archiveFileFilters.ts`
- `src/pages/home/scenes/Members.tsx`
- `src/routes/guards.tsx`
- `src/services/archiveApi.ts`
- `src/services/permissionsApi.ts`
- `src/utils/contentEditing.ts`
- `src/utils/roleAccess.ts`

### Frontend tests

- `tests/adminFilesFilters.test.mjs`
- `tests/adminMemberPermissions.test.mjs`
- `tests/adminRouteGuard.test.mjs`
- `tests/archiveSessionScope.test.mjs`
- `tests/archiveVisibilityApi.test.mjs`
- `tests/contentEditing.test.mjs`
- `tests/e2e/accessibility.spec.js`
- `tests/e2e/app-smoke.spec.js`
- `tests/e2e/appearance.spec.js`
- `tests/e2e/archive-permissions.spec.js`
- `tests/e2e/guest-gating.spec.js`
- `tests/e2e/visualSupport.js`
- `tests/roleAccess.test.mjs`
- `tests/usePermissions.test.mjs`

### API, test configuration and report

- `backend/openapi.json`
- `docs/archive-permissions-verification.md`
- `playwright.config.js`
