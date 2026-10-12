import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Compass, CornerDownLeft, FolderOpen, Megaphone, MessagesSquare, Search, type LucideIcon } from 'lucide-react'
import { activitySectionNavItems, navExtraItems, tabs } from '../data/homeContent'
import { routeLabel } from '../routes/pageTitles'
import { listNotices } from '../services/noticeApi'
import { listCommunityPosts } from '../services/communityApi'
import { listFiles } from '../services/archiveApi'
import { listMeetingPolls } from '../services/meetingPollApi'
import { queryKeys } from '../services/queryKeys'
import { useAuth } from '../contexts/useAuth'
import { usePermissions } from '../contexts/usePermissions'
import { canAccessOperationsPanel } from '../utils/roleAccess'
import { useModalFocus } from '../hooks/useModalFocus'
import { moveQuickIndex, quickDate, searchQuickItems, type QuickGroup, type QuickItem } from '../utils/quickSearch'

/**
 * Quick jump ("빠른 이동"): one box that goes to any page and, for a signed-in member, to a
 * notice, a community post, an archive entry or a meeting poll by its title. Opened with
 * Ctrl+K (or "/") and from the header; components/QuickSearch.tsx mounts it on demand.
 */

type PageItem = QuickItem & { icon?: LucideIcon }

const GROUP_ICONS: Record<QuickGroup, LucideIcon> = {
  page: Compass,
  notice: Megaphone,
  post: MessagesSquare,
  file: FolderOpen,
  poll: CalendarClock,
}

/**
 * A page by its path. The title is the one the browser tab shows; `menuLabel` is what the
 * menu calls it (shown small, and searched) and stands in for a path without a title.
 */
function page(path: string, menuLabel: string, keywords = '', icon?: LucideIcon): PageItem {
  const title = routeLabel(path) || menuLabel || path
  return { id: `page:${path}`, group: 'page', title, hint: menuLabel === title ? '' : menuLabel, path, keywords, icon }
}

/** Every place the menus lead to, in their order, then the few that only have a button somewhere. */
function buildPages(signedIn: boolean, operations: boolean): PageItem[] {
  const pages: PageItem[] = [
    { id: 'page:/', group: 'page', title: '홈', hint: 'Home', path: '/', keywords: 'main 메인 처음' },
    ...tabs.map((tab) => page(`/${tab.id}`, tab.label, tab.hint, tab.icon)),
    ...navExtraItems.map((item) => page(item.path, item.label)),
    ...activitySectionNavItems.map((item) => page(item.path, item.label, item.hint, item.icon)),
    page('/apps', 'Apps', '앱 미니앱'),
    page('/recruit-notice', '', 'recruit notice 모집 안내'),
  ]
  if (signedIn) {
    pages.push(page('/community/bookmarks', '', 'bookmarks 스크랩 저장한 글'), page('/settings', '', 'settings 설정 비밀번호 프로필'))
    if (operations) pages.push(page('/admin', '', 'admin 관리자 운영'))
  } else {
    pages.push(page('/login', '', 'login sign in'), page('/signup', '', 'signup join 가입'))
  }
  return pages
}

type Titled = { id: number | string; title?: string | null; createdAt?: string | null; originalName?: string | null; answered?: boolean }

async function asList(load: () => Promise<unknown>): Promise<Titled[]> {
  const data = await load()
  return Array.isArray(data) ? (data as Titled[]) : []
}

export default function QuickSearchDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { permissions } = usePermissions()
  const signedIn = Boolean(user)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useModalFocus(true, onClose, { initialFocusRef: inputRef })

  // The lists the pages themselves load (same keys where a page keeps one, so an open board is
  // not fetched twice). Guests are not asked anything: those routes are for members.
  const noticesQuery = useQuery({ queryKey: queryKeys.notices.list(), queryFn: () => asList(listNotices), enabled: signedIn })
  const postsQuery = useQuery({ queryKey: queryKeys.community.posts(), queryFn: () => asList(listCommunityPosts), enabled: signedIn })
  const filesQuery = useQuery({ queryKey: ['quick-search', 'files'], queryFn: () => asList(listFiles), enabled: signedIn })
  const pollsQuery = useQuery({ queryKey: ['meeting-polls'], queryFn: () => asList(listMeetingPolls), enabled: signedIn })
  const sources = [noticesQuery, postsQuery, filesQuery, pollsQuery]
  const loading = signedIn && sources.some((source) => source.isLoading)
  const failed = signedIn && sources.some((source) => source.isError)

  const operations = canAccessOperationsPanel(permissions)
  const pages = useMemo(() => buildPages(signedIn, operations), [signedIn, operations])
  const items = useMemo<QuickItem[]>(() => [
    ...pages,
    ...(noticesQuery.data ?? []).map((notice): QuickItem => ({ id: `notice:${notice.id}`, group: 'notice', title: String(notice.title ?? ''), hint: quickDate(notice.createdAt), path: `/notices/${notice.id}` })),
    ...(postsQuery.data ?? []).map((post): QuickItem => ({ id: `post:${post.id}`, group: 'post', title: String(post.title ?? ''), hint: quickDate(post.createdAt), path: `/community/${post.id}` })),
    ...(filesQuery.data ?? []).map((file): QuickItem => ({ id: `file:${file.id}`, group: 'file', title: String(file.title || file.originalName || ''), hint: quickDate(file.createdAt), path: `/resources/${file.id}`, keywords: String(file.originalName ?? '') })),
    ...(pollsQuery.data ?? []).map((poll): QuickItem => ({ id: `poll:${poll.id}`, group: 'poll', title: String(poll.title ?? ''), hint: poll.answered ? '응답함' : '응답 전', path: `/meet/${poll.id}` })),
  ].filter((item) => item.title.trim() !== ''), [pages, noticesQuery.data, postsQuery.data, filesQuery.data, pollsQuery.data])

  const sections = useMemo(() => searchQuickItems(items, query), [items, query])
  const flat = sections.flatMap((section) => section.items)
  // The list can shrink under the highlight (a slower answer arrives, the query narrows).
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1))
  const pageIcons = useMemo(() => new Map(pages.map((item) => [item.id, item.icon])), [pages])

  useEffect(() => {
    document.getElementById(`quick-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const go = (item: QuickItem | undefined) => {
    if (!item) return
    onClose()
    navigate(item.path)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // An IME is still composing the syllable: Enter and the arrows belong to it.
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(moveQuickIndex(activeIndex, event.key === 'ArrowDown' ? 1 : -1, flat.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(flat[activeIndex])
    }
  }

  return (
    <div className="coms-quick" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={containerRef} className="coms-quick-panel" role="dialog" aria-modal="true" aria-label="빠른 이동">
        <div className="coms-quick-field">
          <Search size={18} aria-hidden="true" className="shrink-0 text-[var(--app-accent-text)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-label="어디로 갈까요?"
            aria-expanded="true"
            aria-controls="quick-search-list"
            aria-autocomplete="list"
            aria-activedescendant={flat.length > 0 ? `quick-option-${activeIndex}` : undefined}
            placeholder={signedIn ? '페이지, 공지, 글, 자료 찾기' : '페이지 찾기'}
            autoComplete="off"
            spellCheck={false}
            className="coms-quick-input"
          />
          <button type="button" onClick={onClose} className="coms-quick-esc" aria-label="빠른 이동 닫기">
            <span className="coms-quick-esc-key">Esc</span>
            <span className="coms-quick-esc-word">닫기</span>
          </button>
        </div>

        <div id="quick-search-list" role="listbox" aria-label="갈 수 있는 곳" className="coms-quick-list">
          {sections.map((section) => (
            <div key={section.key} role="group" aria-labelledby={`quick-group-${section.key}`}>
              <p id={`quick-group-${section.key}`} role="presentation" className="coms-quick-group">{section.label}</p>
              {section.items.map((item, offset) => {
                const index = section.start + offset
                const Icon = pageIcons.get(item.id) ?? GROUP_ICONS[item.group]
                return (
                  <div
                    key={item.id}
                    id={`quick-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`coms-quick-option ${index === activeIndex ? 'is-active' : ''}`}
                    onPointerMove={() => { if (index !== activeIndex) setActive(index) }}
                    onClick={() => go(item)}
                  >
                    <span className="coms-quick-icon" aria-hidden="true"><Icon size={15} /></span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.hint && <span className="coms-quick-hint">{item.hint}</span>}
                    <CornerDownLeft size={13} aria-hidden="true" className="coms-quick-enter" />
                  </div>
                )
              })}
            </div>
          ))}
          {flat.length === 0 && !loading && (
            <p className="coms-quick-empty">&quot;{query.trim()}&quot;에 맞는 곳이 없습니다.</p>
          )}
        </div>

        <div className="coms-quick-foot">
          <span role="status">
            {loading ? '목록을 불러오는 중...' : failed ? '일부 목록을 불러오지 못했습니다.' : signedIn ? '제목으로 찾습니다. 초성만 쳐도 됩니다.' : '로그인하면 공지와 글도 찾을 수 있습니다.'}
          </span>
          <span className="coms-quick-keys" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> 이동 <kbd>Enter</kbd> 열기</span>
        </div>
      </div>
    </div>
  )
}
