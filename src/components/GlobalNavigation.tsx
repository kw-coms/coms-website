import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, type NavigateOptions, type To } from 'react-router-dom'
import {
  CalendarDays,
  ChevronDown,
  CircuitBoard,
  Grid3x3,
  HeartHandshake,
  LogOut,
  Menu,
  Megaphone,
  Search,
  Wrench,
  Sparkles,
  X,
} from 'lucide-react'
import { getLogoAsset } from '../utils/logoAssets'
import { useAuth } from '../contexts/useAuth'
import {
  tabs,
  navExtraItems,
  activitySectionNavItems,
  activityNavGroups,
} from '../data/homeContent'
import { scrollToTopInstant } from '../utils/themeColors'
import { isFullPageLink } from '../utils/fullPageLink'
import NotificationButton from './NotificationButton'
import { openQuickSearch } from '../utils/quickSearch'
import { ROLE_LABELS, canAccessOperationsPanel } from '../utils/roleAccess'
import { usePermissions } from '../contexts/usePermissions'

const floatingBarBaseClass = 'apple-topbar border-b border-[var(--app-hairline)]'

// The bottom tab bar has room for three; Study stays reachable from the menu.
const MOBILE_TAB_IDS = ['about', 'activities', 'projects']

function getTabRoute(id) {
  return id === 'recruit' ? '/recruit' : `/${id}`
}

function getActiveNavKey(pathname) {
  if (pathname === '/about') return 'about'
  if (pathname === '/activities') return 'activities'
  if (pathname === '/activity-log') return 'activity-log'
  if (pathname === '/activity-events') return 'activity-events'
  if (pathname === '/monthly-calendar') return 'monthly-calendar'
  if (pathname === '/meet' || pathname.startsWith('/meet/')) return 'meet'
  if (pathname === '/attendance') return 'attendance'
  if (pathname === '/gatherings' || pathname.startsWith('/gatherings/')) return 'gatherings'
  if (pathname === '/projects') return 'projects'
  if (pathname === '/study' || pathname.startsWith('/study/')) return 'study'
  if (pathname === '/apps') return 'apps'
  if (pathname === '/draw') return 'draw'
  if (pathname.startsWith('/recruit')) return 'recruit'
  if (pathname.startsWith('/notices')) return 'notices'
  if (pathname.startsWith('/sponsors')) return 'sponsors'
  if (pathname.startsWith('/resources')) return 'resources'
  if (pathname.startsWith('/community')) return 'community'
  return null
}

export default function GlobalNavigation() {
  const { user, loading: authLoading, logout } = useAuth()
  const { permissions } = usePermissions()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [mobileOpenGroups, setMobileOpenGroups] = useState<string[]>([])
  const [scrolled, setScrolled] = useState(false)
  const [showTop, setShowTop] = useState(false)
  const groupWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const groupToggleRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const mobileMenuToggleRef = useRef<HTMLButtonElement | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)
  // Every navigation closes the mobile menu, not only its own links: the brand link, a
  // notification row and the browser's Back button change the route without closeAndGo.
  // location.key (not pathname) so /admin -> /admin?tab=… from a notification counts too.
  // Reset while rendering, as useVisibleCount does, instead of in a setState effect.
  const [menuLocationKey, setMenuLocationKey] = useState(location.key)
  if (location.key !== menuLocationKey) {
    setMenuLocationKey(location.key)
    setMobileMenuOpen(false)
    setMobileOpenGroups([])
  }
  const activeKey = getActiveNavKey(location.pathname)
  const mobileTabs = MOBILE_TAB_IDS.flatMap((id) => tabs.filter((tab) => tab.id === id))
  const showMobileTabs = mobileTabs.some((tab) => tab.id === activeKey)
  const primaryNavItems = tabs.map((tab) => ({ ...tab, path: 'path' in tab ? tab.path : getTabRoute(tab.id) }))
  const noticesNavItem = navExtraItems.find((item) => item.id === 'notices')
  const memberNavItems = navExtraItems.filter((item) => item.id !== 'notices')

  // Kakao-style header: solidify on scroll, drive the top progress bar, and
  // toggle the back-to-top button.
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = window.scrollY
        setScrolled(y > 8)
        setShowTop(y > 600)
        const max = document.documentElement.scrollHeight - window.innerHeight
        // On the bar itself: a custom property changed on <html> restyles the whole document.
        progressRef.current?.style.setProperty('--scroll-progress', (max > 0 ? y / max : 0).toFixed(4))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (!openGroup) return undefined
    const onDocClick = (event) => {
      const wrapper = groupWrapperRefs.current[openGroup]
      if (wrapper && !wrapper.contains(event.target)) setOpenGroup(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpenGroup(null)
        groupToggleRefs.current[openGroup]?.focus()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openGroup])

  useEffect(() => {
    if (!mobileMenuOpen) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMobileMenuOpen(false)
      setMobileOpenGroups([])
      mobileMenuToggleRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!location.hash) return undefined
    // A hand-typed hash such as "#100%" is not valid percent-encoding: decodeURIComponent
    // throws, and an error thrown from this effect (outside the route error boundary) takes
    // the whole app down. Fall back to the raw hash.
    let sectionId = location.hash.slice(1)
    try {
      sectionId = decodeURIComponent(sectionId)
    } catch {
      // Not decodable; look the id up as written.
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash, location.pathname])

  const goPageTop = (to: To, options?: NavigateOptions) => {
    if (isFullPageLink(to)) {
      window.location.assign(to)
      return
    }
    scrollToTopInstant()
    navigate(to, options)
  }

  const closeAndGo = (to: To, options?: NavigateOptions) => {
    setMobileMenuOpen(false)
    setMobileOpenGroups([])
    goPageTop(to, options)
  }

  const goProtected = (to) => {
    if (authLoading) return
    closeAndGo(to)
  }

  const goNavItem = (item) => {
    const target = `${item.path}${item.hash || ''}`
    setOpenGroup(null)
    if (item.auth) {
      goProtected(target)
      return
    }
    goPageTop(target)
  }

  const handleLogout = async () => {
    // logout() resolves false when the server could not be reached: the member is still signed
    // in (and has been told so), so they stay where they are.
    const loggedOut = await logout()
    setMobileMenuOpen(false)
    if (loggedOut !== false) goPageTop('/')
  }

  const navClass = (key, active = activeKey === key) => (
    `relative px-0 text-xs xl:px-1 font-semibold transition ${
      active
        ? 'text-[var(--app-text)]'
        : 'text-[var(--app-muted)] hover:text-[var(--app-text)]'
    }`
  )

  return (
    <>
    <div ref={progressRef} className="coms-scroll-progress" aria-hidden="true" />
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`coms-to-top ${showTop ? 'is-visible' : ''}`}
      aria-label="맨 위로"
    >
      <ChevronDown size={20} className="rotate-180" />
    </button>
    <header className={`apple-global-nav fixed inset-x-0 top-0 z-[80] ${scrolled ? 'is-scrolled' : ''}`}>
      {/* From lg up the bar is a 1fr / auto / 1fr grid: the nav stays optically centred while
          there is room and is pushed aside — never painted over — when the account cluster
          needs more width. Below lg the hamburger menu takes over; the centred nav used to
          show from 768px, where it overlapped the brand and the account buttons. The brand never
          shrinks at lg (min-w-max), so the grid gap is the least that ever separates it from the nav;
          the horizontal padding and the xl nav gap are trimmed to leave room for that at 1024-1535px
          whichever face is drawn (the Linux fallback face used to push the nav 3px from the brand). The account name is capped at
          7rem below 2xl so even a very long name leaves the cluster inside the bar at 1280px. */}
      <div className={`${floatingBarBaseClass} relative mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-6 2xl:px-8`}>
        <button
          type="button"
          onClick={() => goPageTop('/')}
          className="apple-global-nav-brand flex min-w-0 items-center gap-3 text-left lg:min-w-max lg:justify-self-start"
          aria-label="홈으로 이동"
        >
          <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="h-6 w-6 shrink-0 object-contain" />
          <span className="whitespace-nowrap text-sm font-bold text-[var(--app-text)]">KW COM&apos;s</span>
        </button>

        {/* Tight below 2xl (gap-1 and no button padding at lg, gap-1.5 at xl: with the Lab item, gap-2 pushed a 20-character name 4px out of the bar at 1280px): with the Records and Tools buttons and the
            quick-jump button in the account cluster, wider gaps no longer fitted at 1024px and
            1280px and the brand was painted over. */}
        <nav className="hidden items-center lg:flex lg:gap-1 xl:gap-1.5 2xl:gap-5">
          {primaryNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goNavItem(item)}
              className={`${navClass(item.id)} disabled:cursor-wait disabled:opacity-60`}
            >
              {item.label}
              <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${activeKey === item.id ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          ))}
          {noticesNavItem && (
            <button
              type="button"
              onClick={() => goNavItem(noticesNavItem)}
              className={navClass(noticesNavItem.id)}
            >
              {noticesNavItem.label}
              <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${activeKey === noticesNavItem.id ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          )}
          {activityNavGroups.map((group) => {
            const groupItems = activitySectionNavItems.filter((item) => item.group === group.id)
            const open = openGroup === group.id
            const groupActive = groupItems.some((item) => item.id === activeKey)
            return (
              <div key={group.id} ref={(node) => { groupWrapperRefs.current[group.id] = node }} className="relative">
                <button
                  ref={(node) => { groupToggleRefs.current[group.id] = node }}
                  type="button"
                  onClick={() => setOpenGroup(open ? null : group.id)}
                  className={`${navClass(group.id, groupActive)} inline-flex items-center gap-1`}
                  data-active={groupActive ? 'true' : undefined}
                  aria-current={groupActive ? 'true' : undefined}
                  aria-expanded={open}
                  aria-controls={`${group.id}-nav-panel`}
                >
                  {group.navLabel}
                  <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {open && (
                  <nav
                    id={`${group.id}-nav-panel`}
                    aria-label={`${group.label} 메뉴`}
                    className="absolute left-1/2 top-full z-[90] mt-4 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--app-hairline)] bg-[var(--app-surface)] py-2 shadow-[0_18px_45px_rgba(0,0,0,0.12)]"
                  >
                    <ul className="flex flex-col">
                      {groupItems.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => goNavItem(item)}
                            className="flex w-full items-start gap-3 px-4 py-2.5 transition hover:bg-[var(--app-surface-soft)]"
                          >
                            <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]">
                              <item.icon size={14} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-left text-sm font-semibold text-[var(--app-text)]">{item.label}</span>
                              <span className="block text-left text-xs font-medium text-[var(--app-subtle)]">{item.hint}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
              </div>
            )
          })}
          {memberNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goNavItem(item)}
              disabled={item.auth && authLoading}
              className={`${navClass(item.id)} disabled:cursor-wait`}
            >
              {item.label}
              <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${activeKey === item.id ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          ))}
          <button type="button" onClick={() => goPageTop('/apps')} className={navClass('apps', activeKey === 'apps')}>
            Apps
            <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${activeKey === 'apps' ? 'opacity-100' : 'opacity-0'}`} />
          </button>
        </nav>

        {user ? (
          <div className="hidden items-center gap-1 lg:flex lg:justify-self-end">
            <button type="button" onClick={openQuickSearch} className="coms-quick-open" aria-label="빠른 이동 열기" aria-keyshortcuts="Control+K Meta+K" title="빠른 이동 (Ctrl+K)">
              <Search size={15} aria-hidden="true" />
            </button>
            <NotificationButton />
            <button
              type="button"
              onClick={() => goPageTop('/settings')}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] text-[11px] font-bold text-[var(--app-text)] transition hover:bg-black/5 xl:size-auto xl:max-w-[7rem] 2xl:max-w-[9rem] xl:border-transparent xl:bg-transparent xl:px-2.5 xl:py-1 xl:text-xs xl:font-semibold xl:text-[var(--app-muted)] xl:hover:text-[var(--app-text)]"
              title="계정 설정"
            >
              <span className="xl:hidden" aria-hidden="true">{user.name?.[0] ?? '?'}</span>
              <span className="sr-only xl:not-sr-only xl:truncate">{user.name}</span>
            </button>
            {canAccessOperationsPanel(permissions) && (
              <button type="button" onClick={() => goPageTop('/admin')} className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-bold text-[var(--app-accent-text)] transition hover:border-[var(--app-accent-border,rgba(0,113,227,0.4))]">
                {ROLE_LABELS[user.role] || '임원'}
              </button>
            )}
            <button type="button" onClick={handleLogout} title="로그아웃" className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-black/5 hover:text-[var(--app-text)] xl:px-2.5">
              <LogOut size={14} aria-hidden="true" />
              <span className="sr-only xl:not-sr-only">Logout</span>
            </button>
          </div>
        ) : (
          <div className="hidden items-center gap-2 lg:flex lg:justify-self-end">
            <button type="button" onClick={openQuickSearch} className="coms-quick-open" aria-label="빠른 이동 열기" aria-keyshortcuts="Control+K Meta+K" title="빠른 이동 (Ctrl+K)">
              <Search size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => goPageTop('/login')}
              disabled={authLoading}
              className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[var(--app-accent)] px-4 py-1 text-xs font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-wait disabled:opacity-70"
            >
              로그인
            </button>
          </div>
        )}

        <div className="flex items-center lg:hidden">
          <button type="button" onClick={openQuickSearch} className="coms-quick-open size-11" aria-label="빠른 이동 열기">
            <Search size={19} aria-hidden="true" />
          </button>
          <button
            ref={mobileMenuToggleRef}
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="apple-global-nav-menu lg:hidden"
            aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? <X size={21} strokeWidth={2.1} /> : <Menu size={22} strokeWidth={2.25} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          id="mobile-menu"
          aria-label="모바일 메뉴"
          className="apple-mobile-menu-panel mx-auto lg:hidden"
        >
          <div className="flex flex-col divide-y divide-[var(--app-hairline)]">
            {primaryNavItems.map((item) => (
              <button key={item.id} type="button" onClick={() => closeAndGo(`${item.path}${(item as { hash?: string }).hash || ''}`)} className="apple-mobile-menu-item">
                <item.icon size={15} className={item.accent} />
                <span>{item.label}</span>
                <span className="ml-auto text-xs text-[var(--app-muted)]">{item.hint}</span>
              </button>
            ))}
            <button type="button" onClick={() => closeAndGo('/notices')} className="apple-mobile-menu-item">
              <Megaphone size={15} className="text-cyan-500" />
              <span>Notices</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">공지사항</span>
            </button>
            {activityNavGroups.map((group) => {
              const open = mobileOpenGroups.includes(group.id)
              return (
                <Fragment key={group.id}>
                  <button
                    type="button"
                    onClick={() => setMobileOpenGroups((ids) => (open ? ids.filter((id) => id !== group.id) : [...ids, group.id]))}
                    aria-expanded={open}
                    aria-controls={`mobile-${group.id}-panel`}
                    className="apple-mobile-menu-item"
                  >
                    {group.id === 'tools'
                      ? <Wrench size={15} className="text-amber-500" />
                      : <CalendarDays size={15} className="text-sky-500" />}
                    <span>{group.navLabel}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--app-muted)]">
                      {group.label}
                      <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </span>
                  </button>
                  {open && (
                    <ul id={`mobile-${group.id}-panel`} className="flex flex-col divide-y divide-[var(--app-hairline)] bg-black/[0.015]">
                      {activitySectionNavItems.filter((item) => item.group === group.id).map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => closeAndGo(item.path)}
                            className="apple-mobile-menu-item apple-mobile-menu-subitem"
                          >
                            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]">
                              <item.icon size={13} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-[var(--app-text)]">{item.label}</span>
                              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--app-muted)]">{item.hint}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Fragment>
              )
            })}
            <button type="button" onClick={() => closeAndGo('/sponsors')} className="apple-mobile-menu-item">
              <HeartHandshake size={15} className="text-emerald-500" />
              <span>Sponsors</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">후원자</span>
            </button>
            <button type="button" onClick={() => goProtected('/resources')} disabled={authLoading} className="apple-mobile-menu-item disabled:opacity-50">
              <CircuitBoard size={15} className="text-violet-400" />
              <span>Resources</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">자료실</span>
            </button>
            <button type="button" onClick={() => goProtected('/community')} disabled={authLoading} className="apple-mobile-menu-item disabled:opacity-50">
              <Sparkles size={15} className="text-rose-400" />
              <span>Community</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">커뮤니티</span>
            </button>
            <button
              type="button"
              onClick={() => closeAndGo('/apps')}
              className="apple-mobile-menu-item"
            >
              <Grid3x3 size={15} className="text-sky-500" />
              <span>Apps</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">서비스</span>
            </button>
            {!user && (
              <button type="button" onClick={() => closeAndGo('/login')} disabled={authLoading} className="apple-mobile-menu-item apple-mobile-menu-item-accent disabled:opacity-50">
                <span>로그인</span>
              </button>
            )}
            {user && (
              <div className="border-t border-[var(--app-hairline)]">
                <div className="flex flex-col divide-y divide-[var(--app-hairline)]">
                  <button type="button" onClick={() => closeAndGo('/settings')} className="apple-mobile-menu-item">
                    <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-[10px] font-black">{user.name?.[0] ?? '?'}</span>
                    <span>{user.name}</span>
                    <span className="ml-auto text-xs text-[var(--app-muted)]">계정 설정</span>
                  </button>
                  {canAccessOperationsPanel(permissions) && (
                    <button type="button" onClick={() => closeAndGo('/admin')} className="apple-mobile-menu-item apple-mobile-menu-item-warning">
                      <span>{(ROLE_LABELS[user.role] || '임원') + ' 패널'}</span>
                    </button>
                  )}
                  <NotificationButton alignLeft variant="mobileMenu" />
                  <button type="button" onClick={handleLogout} className="apple-mobile-menu-item">
                    <LogOut size={15} />
                    <span>로그아웃</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>
      )}

      {showMobileTabs && (
        <nav className="apple-mobile-tabs md:hidden" aria-label="상세 화면 이동">
          {mobileTabs.map((tab) => {
            const active = activeKey === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => closeAndGo('path' in tab ? tab.path : getTabRoute(tab.id))}
                className={`apple-mobile-tab ${active ? 'apple-mobile-tab-active' : ''}`}
              >
                {tab.label}
                <span aria-hidden="true" />
              </button>
            )
          })}
        </nav>
      )}
    </header>
    </>
  )
}
