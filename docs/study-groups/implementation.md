# Study groups

The study hub links to `/study/groups` and `/study/groups/:groupId`. The static course pages remain at `/study/:id`. The group pages use the existing gathering and date-poll routes.

## Endpoints and permissions

In the tables below, **activity manager** means a member with effective `activity.write`, including ADMIN. **Group manager** means the eligible group leader or an activity manager. **Participant** means an approved member or group manager.

Group operations use `/api/study-groups`.

| Method and path suffix | Access |
| --- | --- |
| `GET /` | Guests receive recruiting and active cards with display fields only. Signed-in members also see proposals, ended groups and interest counts. `sort=interest` applies to signed-in requests. |
| `POST /` | USER or higher may propose. `direct=true` requires an activity manager, with a USER-or-higher leader. |
| `GET /{id}` | Signed-in members. Interest identities appear for group managers. |
| `PUT /{id}`, `POST /{id}/start` | Group managers. Start moves recruiting groups to active. |
| `POST /{id}/approve`, `POST /{id}/end`, `PUT /{id}/leader` | Activity managers. Approval moves proposals to recruiting. |
| `POST /{id}/join`, `DELETE /{id}/members/me` | Signed-in members may apply to recruiting or active groups and withdraw or leave. A leader can leave after replacement. |
| `GET /{id}/members` | Participants see approved members. Group managers also see pending applications. |
| `PUT /{id}/members/{studentId}`, `DELETE /{id}/members/{studentId}` | Group managers may decide pending applications and remove members. |
| `GET /{id}/interest` | Signed-in members see totals and breakdowns. Group managers also see respondent identities. |
| `PUT /{id}/interest`, `DELETE /{id}/interest` | Signed-in members submit or clear their own interest while the group is proposed or recruiting. |

Round and attendance operations use `/api/study-groups/{groupId}`.

| Method and path suffix | Access |
| --- | --- |
| `GET /sessions`, `GET /sessions/{sessionId}` | Participants. Open codes appear for group managers. |
| `POST /sessions`, `PUT /sessions/{sessionId}` | Group managers. Round numbers are assigned per group. |
| `POST /sessions/{sessionId}/attendance/open`, `POST /sessions/{sessionId}/attendance/close` | Group managers. Opening requires a recruiting or active group and a round dated today or earlier in Seoul. |
| `GET /sessions/{sessionId}/attendance/roster` | Participants. Historical marks remain visible after a member leaves. |
| `PUT /sessions/{sessionId}/attendance/members/{studentId}` | Group managers can manually mark approved members, including rounds without a code. |
| `GET /attendance/rates`, `GET /attendance/rates.csv` | Group managers. |
| `POST /api/attendance/check-in` | Existing attendance code entry. Study check-in requires approved group membership. |

A rate includes past and current rounds tracked since a member was approved. Present and late marks count as attended. The first manual mark or first code opening starts tracking that round. A valid code can record a check-in after a manual absence while the code is open. Opening another code window retains the existing records.

| Method and path | Access |
| --- | --- |
| `GET /api/files?studyGroupId={id}&studySessionId={optionalRoundId}` | Participants. |
| `POST /api/files` with `studyGroupId` and optional `studySessionId` | Participants. A supplied round must belong to the group. |
| Existing file detail, inline, primary download, attachment download and rich-media reads | Group files require participant access through the archive visibility rules. |
| `GET /api/admin/club-forms`, `POST /api/admin/club-forms` | Activity managers for STUDY forms. ADMIN manages every category. |
| `PUT /api/admin/club-forms/{id}`, `DELETE /api/admin/club-forms/{id}`, `GET /api/admin/club-forms/{id}/responses`, `GET /api/admin/club-forms/{id}/aggregates` | Activity managers for STUDY forms. ADMIN manages every category. |
| Existing `/api/club-forms` list, detail and response routes | Signed-in members, with the existing response acceptance and deadline checks. |

## Persistence and notifications

| Migration | Changes |
| --- | --- |
| `V129__study_groups.sql` | Groups, membership and demand responses. |
| `V130__study_sessions_attendance.sql` | Study rounds and attendance linkage, status and source. Existing records default to `PRESENT` and `CODE`. |
| `V131__study_archive_materials.sql` | Group and optional round links on archive files. Group files use `GROUP` visibility. |

Study notifications use the existing notification service and link to the group. Join requests notify the leader, approvals notify the applicant, and opened attendance notifies approved members.

The generated API contract is in `backend/openapi.json`.
