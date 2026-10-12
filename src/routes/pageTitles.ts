// Per-route document titles. Every route used to share index.html's single <title>, so
// browser tabs, history entries and bookmarks were indistinguishable and a screen reader
// had nothing to announce on navigation.

export const SITE_NAME = "KW COM's"
export const SITE_TITLE = "KW COM's — 광운대학교 컴퓨터 학술동아리"
export const NOT_FOUND_LABEL = '페이지를 찾을 수 없음'

const MAX_DETAIL_LENGTH = 60

// First match wins, so more specific paths come before their section prefix.
const ROUTE_LABELS: Array<[pattern: RegExp, label: string]> = [
  [/^\/about$/, '동아리 소개'],
  [/^\/activities$/, '활동'],
  [/^\/activity-log$/, '활동 기록'],
  [/^\/activity-events$/, '이벤트'],
  [/^\/monthly-calendar$/, '일정 캘린더'],
  [/^\/meet(\/[^/]+)?$/, '일정 조율'],
  [/^\/attendance$/, '출석 체크'],
  [/^\/projects$/, '프로젝트'],
  [/^\/apps$/, 'Apps'],
  [/^\/sponsors$/, '후원자'],
  [/^\/notices(\/[^/]+)?$/, '공지사항'],
  [/^\/resources(\/[^/]+)?$/, '자료실'],
  [/^\/community\/bookmarks$/, '내 스크랩'],
  [/^\/community\/members\/[^/]+$/, '회원 프로필'],
  [/^\/community(\/[^/]+)?$/, '커뮤니티'],
  [/^\/login$/, '로그인'],
  [/^\/signup$/, '회원가입'],
  [/^\/admin$/, '운영 패널'],
  [/^\/settings$/, '계정 설정'],
  [/^\/recruit$/, '지원하기'],
  [/^\/recruit-notice$/, '모집 공지'],
]

function normalizePath(pathname: string) {
  const trimmed = (pathname || '/').replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** Section label for a path: '' for the home page, null when no route matches. */
export function routeLabel(pathname: string): string | null {
  const path = normalizePath(pathname)
  if (path === '/') return ''
  const match = ROUTE_LABELS.find(([pattern]) => pattern.test(path))
  return match ? match[1] : null
}

function clampDetail(detail: string) {
  const collapsed = detail.replace(/\s+/g, ' ').trim()
  return collapsed.length > MAX_DETAIL_LENGTH ? `${collapsed.slice(0, MAX_DETAIL_LENGTH - 1)}…` : collapsed
}

/**
 * Title for the browser tab. `detail` is the opened item's own title (a notice, a post,
 * an archive entry) and is shown ahead of the section label.
 */
export function documentTitleFor(pathname: string, detail?: string | null): string {
  const label = routeLabel(pathname)
  if (label === '') return SITE_TITLE
  const parts = [label ?? NOT_FOUND_LABEL, SITE_NAME]
  const cleanDetail = detail ? clampDetail(detail) : ''
  if (label !== null && cleanDetail) parts.unshift(cleanDetail)
  return parts.join(' | ')
}
