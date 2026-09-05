type Role = string | null | undefined

// Privilege ladder, mirroring the backend's Member.Role + RoleHierarchy — all five
// values, lowest last:
// 회장(ADMIN) > 부회장(VICE_PRESIDENT) > 임원(OFFICER) > 일반 회원(USER) > 준회원(ASSOCIATE).
// ASSOCIATE sits BELOW USER: a 준회원 is a provisional member who has not been
// promoted into the 명부 yet, so it must never clear a USER-level gate.
const ROLE_RANK: Record<string, number> = {
  ASSOCIATE: 0,
  USER: 1,
  OFFICER: 2,
  VICE_PRESIDENT: 3,
  ADMIN: 4,
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: '회장',
  VICE_PRESIDENT: '부회장',
  OFFICER: '임원',
  USER: '회원',
  ASSOCIATE: '준회원',
}

// Roles assignable from the member-management screen, highest first.
export const ASSIGNABLE_ROLES = ['ADMIN', 'VICE_PRESIDENT', 'OFFICER', 'USER', 'ASSOCIATE'] as const

// 회장이 조정할 수 있는 권한 키 — backend com.coms.backend.domain.Permission 과 1:1.
export const PERMISSIONS = {
  clubRoomView: 'club_room.view',
  communityAnonymousBoard: 'community.anonymous_board',
  communityModerate: 'community.moderate',
  noticeWrite: 'notice.write',
  activityWrite: 'activity.write',
  projectWrite: 'project.write',
  archiveManage: 'archive.manage',
  siteSettingsEdit: 'site_settings.edit',
  operationsPanel: 'operations.panel',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS)

// 회장이 매트릭스를 손대기 전의 기본값 — backend Permission enum 의 defaultRoles 와
// 같은 표여야 한다(tests/roleAccess.test.mjs 가 이 거울을 고정한다). 서버의
// /api/permissions/me 가 아직 도착하지 않은 동안의 낙관적 fallback 으로만 쓴다.
const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, PermissionKey[]> = {
  ASSOCIATE: [],
  USER: [PERMISSIONS.clubRoomView, PERMISSIONS.communityAnonymousBoard],
  OFFICER: [
    PERMISSIONS.clubRoomView,
    PERMISSIONS.communityAnonymousBoard,
    PERMISSIONS.noticeWrite,
    PERMISSIONS.activityWrite,
    PERMISSIONS.projectWrite,
    PERMISSIONS.siteSettingsEdit,
    PERMISSIONS.operationsPanel,
  ],
  VICE_PRESIDENT: [
    PERMISSIONS.clubRoomView,
    PERMISSIONS.communityAnonymousBoard,
    PERMISSIONS.communityModerate,
    PERMISSIONS.noticeWrite,
    PERMISSIONS.activityWrite,
    PERMISSIONS.projectWrite,
    PERMISSIONS.archiveManage,
    PERMISSIONS.siteSettingsEdit,
    PERMISSIONS.operationsPanel,
  ],
  // 회장은 매트릭스 밖 — 언제나 전부.
  ADMIN: ALL_PERMISSION_KEYS,
}

export type PermissionSet = Iterable<string> | null | undefined

export function defaultPermissionsForRole(role: Role): PermissionKey[] {
  return DEFAULT_PERMISSIONS_BY_ROLE[role || ''] ?? []
}

function has(permissions: PermissionSet, key: PermissionKey) {
  if (!permissions) return false
  if (permissions instanceof Set) return permissions.has(key)
  for (const value of permissions) {
    if (value === key) return true
  }
  return false
}

function hasAny(permissions: PermissionSet, keys: PermissionKey[]) {
  return keys.some((key) => has(permissions, key))
}

// 운영 탭 ↔ 권한. 여기에 없는 탭은 회장 전용(회원/모집/명부/후원자/폰트/차단/로그 등).
export const TAB_PERMISSIONS: Record<string, PermissionKey> = {
  activities: PERMISSIONS.activityWrite,
  projects: PERMISSIONS.projectWrite,
  'site-settings': PERMISSIONS.siteSettingsEdit,
  files: PERMISSIONS.archiveManage,
  community: PERMISSIONS.communityModerate,
  'deleted-posts': PERMISSIONS.communityModerate,
}

const OPERATIONS_PERMISSIONS: PermissionKey[] = [
  ...new Set(Object.values(TAB_PERMISSIONS)),
  PERMISSIONS.noticeWrite,
]

// 졸업생 합성 ID(G{입학연도}-{명부번호})는 내부 키 — 화면에는 입학연도만.
export function displayStudentId(studentId?: string | null) {
  const raw = String(studentId || '')
  const match = raw.match(/^G(\d{4})-\d+$/)
  if (match) return `${match[1]} (졸업생)`
  return raw
}

export function roleAtLeast(role: Role, tier: keyof typeof ROLE_RANK) {
  return (ROLE_RANK[role || ''] ?? -1) >= ROLE_RANK[tier]
}

// 동아리방 비밀번호: club_room.view (기본 회원 이상).
export function canSeeClubRoom(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.clubRoomView)
}

// 활동·일정·이벤트 관리: activity.write (기본 임원 이상).
export function canManageContent(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.activityWrite)
}

// 공지 작성·수정·삭제·고정: notice.write (기본 임원 이상).
export function canWriteNotice(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.noticeWrite)
}

// COM's 프로젝트 관리: project.write (기본 임원 이상).
export function canManageProjects(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.projectWrite)
}

// 커뮤니티 중재(글 고정·타인 글 삭제·신고 처리·삭제 보관함·익명 작성자 확인).
export function canModerateCommunity(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.communityModerate)
}

// 익명게시판 이용 — 졸업생 제외 규칙은 호출부에서 학번으로 판단한다(백엔드와 동일).
export function canUseAnonymousBoard(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.communityAnonymousBoard)
}

// 자료실 삭제·작성자 변경: archive.manage (기본 부회장 이상).
export function canManageArchive(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.archiveManage)
}

// 사이트 문구·동방 비번 편집: site_settings.edit (기본 임원 이상).
export function canEditSiteSettings(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.siteSettingsEdit)
}

// 회장 전용: member roles/removal, ban, recruit, audit logs, fonts, apps,
// sponsors, analytics, 권한 관리 — 매트릭스로 열 수 없는 경계.
export function canManageSensitiveAdmin(role: Role) {
  return role === 'ADMIN'
}

// 운영 패널: 조정 가능한 운영 권한을 하나라도 가졌거나 operations.panel 이 켜져 있으면.
export function canAccessOperationsPanel(permissions: PermissionSet) {
  return has(permissions, PERMISSIONS.operationsPanel) || hasAny(permissions, OPERATIONS_PERMISSIONS)
}

export function adminTabsForRole<T extends { id: string }>(role: Role, permissions: PermissionSet, tabs: T[]) {
  if (canManageSensitiveAdmin(role)) return tabs
  return tabs.filter((tab) => {
    const required = TAB_PERMISSIONS[tab.id]
    return Boolean(required) && has(permissions, required)
  })
}

export function defaultOperationsTab(role: Role, permissions: PermissionSet, requested?: string | null) {
  if (canManageSensitiveAdmin(role)) return requested || 'overview'
  const required = requested ? TAB_PERMISSIONS[requested] : undefined
  if (required && has(permissions, required)) return requested as string
  const firstAllowed = Object.keys(TAB_PERMISSIONS).find((id) => has(permissions, TAB_PERMISSIONS[id]))
  return firstAllowed || 'activities'
}
