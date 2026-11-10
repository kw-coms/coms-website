// The operator panel's tabs and the four headings they sit under. `overview` has no heading:
// it is the landing page. Who may see a tab is decided in roleAccess (adminTabsForRole).

export type AdminGroupId = 'people' | 'content' | 'site' | 'system'

export const ADMIN_GROUPS: { id: AdminGroupId; label: string }[] = [
  { id: 'people', label: '사람' },
  { id: 'content', label: '콘텐츠' },
  { id: 'site', label: '사이트' },
  { id: 'system', label: '시스템' },
]

export const ADMIN_TABS: { id: string; label: string; group: AdminGroupId | null }[] = [
  { id: 'overview', label: '운영 요약', group: null },
  { id: 'members', label: '회원 관리', group: 'people' },
  { id: 'roster', label: '명부 인증', group: 'people' },
  { id: 'permissions', label: '권한 관리', group: 'people' },
  { id: 'ban', label: '차단 관리', group: 'people' },
  { id: 'recruit', label: '모집 관리', group: 'people' },
  { id: 'activities', label: '활동 관리', group: 'content' },
  { id: 'community', label: '커뮤니티 관리', group: 'content' },
  { id: 'deleted-posts', label: '삭제 보관함', group: 'content' },
  { id: 'files', label: '파일 관리', group: 'content' },
  { id: 'projects', label: 'Apps 관리', group: 'content' },
  { id: 'sponsors', label: '후원자', group: 'content' },
  { id: 'site-settings', label: '사이트 문구', group: 'site' },
  { id: 'fonts', label: '폰트 관리', group: 'site' },
  { id: 'screen-check', label: '수동 점검', group: 'site' },
  { id: 'analytics', label: '분석', group: 'system' },
  { id: 'logs', label: '로그', group: 'system' },
]

/** The groups that still have a tab after permissions, each with its visible tabs. */
export function groupVisibleTabs<T extends { id: string; group: AdminGroupId | null }>(visibleTabs: T[]) {
  return ADMIN_GROUPS
    .map((group) => ({ ...group, tabs: visibleTabs.filter((tab) => tab.group === group.id) }))
    .filter((group) => group.tabs.length > 0)
}
