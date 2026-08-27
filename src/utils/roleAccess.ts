type Role = string | null | undefined

// Privilege ladder, mirroring the backend's Member.Role + RoleHierarchy:
// 회장(ADMIN) > 부회장(VICE_PRESIDENT) > 임원(OFFICER) > 일반 회원(USER).
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

const OFFICER_TAB_IDS = new Set(['activities', 'projects', 'site-settings'])
// 부회장 additionally moderates community + archive.
const VICE_PRESIDENT_TAB_IDS = new Set([...OFFICER_TAB_IDS, 'files', 'community', 'deleted-posts'])

export function roleAtLeast(role: Role, tier: keyof typeof ROLE_RANK) {
  return (ROLE_RANK[role || ''] ?? -1) >= ROLE_RANK[tier]
}

// 동아리방 비밀번호: 회원(USER) 이상 — 준회원(ASSOCIATE) 제외.
export function canSeeClubRoom(role: Role) {
  return roleAtLeast(role, 'USER')
}

export function canManageContent(role: Role) {
  return roleAtLeast(role, 'OFFICER')
}

// 부회장 이상: community moderation (delete/restore others' posts, pin,
// unmasked anonymous view) and archive management (delete, author edit).
export function canModerateCommunity(role: Role) {
  return roleAtLeast(role, 'VICE_PRESIDENT')
}

export function canManageArchive(role: Role) {
  return roleAtLeast(role, 'VICE_PRESIDENT')
}

// 회장 전용: member roles/removal, ban, recruit, audit logs, fonts, apps,
// analytics — everything under the sensitive admin boundary.
export function canManageSensitiveAdmin(role: Role) {
  return role === 'ADMIN'
}

export function canAccessOperationsPanel(role: Role) {
  return canManageContent(role)
}

export function adminTabsForRole<T extends { id: string }>(role: Role, tabs: T[]) {
  if (canManageSensitiveAdmin(role)) return tabs
  if (role === 'VICE_PRESIDENT') return tabs.filter((tab) => VICE_PRESIDENT_TAB_IDS.has(tab.id))
  if (role === 'OFFICER') return tabs.filter((tab) => OFFICER_TAB_IDS.has(tab.id))
  return []
}

export function defaultOperationsTab(role: Role, requested?: string | null) {
  if (canManageSensitiveAdmin(role)) return requested || 'overview'
  if (role === 'VICE_PRESIDENT' && requested && VICE_PRESIDENT_TAB_IDS.has(requested)) return requested
  if (role === 'OFFICER' && requested && OFFICER_TAB_IDS.has(requested)) return requested
  return 'activities'
}
