import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, type NavigateOptions, type To } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, Search } from 'lucide-react'
import { getLogoAsset } from '../utils/logoAssets'
import { useAuth } from '../contexts/useAuth'
import { navGroups, type NavItem } from '../data/homeContent'
import { scrollToTopInstant } from '../utils/themeColors'
import { isFullPageLink } from '../utils/fullPageLink'
import { countNavVisit, frequentNavPaths, navPathFor, readNavVisits } from '../utils/navVisits'
import NotificationButton from './NotificationButton'
import MemberLock from './MemberLock'
import MobileNavMenu from './MobileNavMenu'
import { openQuickSearch } from '../utils/quickSearch'
import { ROLE_LABELS, canAccessOperationsPanel } from '../utils/roleAccess'
import { usePermissions } from '../contexts/usePermissions'
import { confirmEditorLeave } from '../hooks/useEditorDraft'
import { TOUR_SURFACE_EVENT, type TourSurface } from './tour/tourState'

const floatingBarBaseClass = 'apple-topbar border-b border-[var(--app-hairline)]'

const ITEMS: NavItem[] = navGroups.flatMap((group) => group.items)
const ITEM_PATHS = ITEMS.map((item) => item.path)

// The bottom tab bar has room for three; everything else is in the menu.
const MOBILE_TAB_IDS = ['about', 'activities', 'projects']
const MOBILE_TABS = ITEMS.filter((item) => MOBILE_TAB_IDS.includes(item.id))

// Wait a moment before a hover opens or closes the panel, so a pointer crossing the bar does not flash it.
const HOVER_OPEN_MS = 120
const HOVER_CLOSE_MS = 220

const SHORTCUT_LABEL = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘K' : 'Ctrl K'

// Module level, not a ref: the header can mount again (when the login check finishes) and must not count the same page twice.
let lastCountedKey = ''

function frequentItems(): NavItem[] {
  return frequentNavPaths(readNavVisits(), ITEM_PATHS).flatMap((path) => ITEMS.filter((item) => item.path === path))
}

function QuickSearchPill() {
  return (
    <button type="button" onClick={openQuickSearch} className="nav-search" aria-label="빠른 이동 열기" aria-keyshortcuts="Control+K Meta+K" title={`빠른 이동 (${SHORTCUT_LABEL})`}>
      <Search size={14} aria-hidden="true" />
      <span className="nav-search-text">빠른 이동</span>
      <kbd aria-hidden="true">{SHORTCUT_LABEL}</kbd>
    </button>
  )
}

export default function GlobalNavigation() {
  const { user, loading: authLoading, logout } = useAuth()
  const { permissions } = usePermissions()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [tourSurface, setTourSurface] = useState<TourSurface>(null)
  const tourSurfaceRef = useRef<TourSurface>(null)
  const [frequent, setFrequent] = useState<NavItem[]>([])
  const [scrolled, setScrolled] = useState(false)
  const [showTop, setShowTop] = useState(false)
  const groupToggleRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const groupNavRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)
  const hoverTimer = useRef(0)
  // True while the panel was opened by hovering: a click on that group then keeps it open.
  const openedByHover = useRef(false)
  // The group the panel was last opened on by a click or the keyboard; null when it only followed the pointer.
  const clickedGroup = useRef<string | null>(null)
  // Set when the keyboard opened a group: focus moves into its column once it is drawn.
  const focusColumn = useRef<string | null>(null)
  // Every navigation closes the menus, not only their own links: the brand link, a
  // notification row and the browser's Back button change the route without our handlers.
  // location.key (not pathname) so /admin -> /admin?tab=… from a notification counts too.
  // Reset while rendering, as useVisibleCount does, instead of in a setState effect.
  const [menuLocationKey, setMenuLocationKey] = useState(location.key)
  if (location.key !== menuLocationKey) {
    setMenuLocationKey(location.key)
    setMobileMenuOpen(false)
    setOpenGroup(null)
  }
  const activePath = navPathFor(location.pathname, ITEM_PATHS)
  const activeGroupId = navGroups.find((group) => group.items.some((item) => item.path === activePath))?.id ?? null
  const showMobileTabs = MOBILE_TABS.some((item) => item.path === activePath)

  // Count the visit to a menu page for "자주 가는 곳".
  useEffect(() => {
    if (lastCountedKey === location.key || !activePath) return
    lastCountedKey = location.key
    countNavVisit(activePath)
  }, [location.key, activePath])

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

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  useEffect(() => {
    const onTourSurface = (event: Event) => {
      const surface = (event as CustomEvent<TourSurface>).detail
      if (surface === null || surface === 'ask') {
        if (tourSurfaceRef.current !== null) {
          window.clearTimeout(hoverTimer.current)
          setMobileMenuOpen(false)
          setOpenGroup(null)
        }
        tourSurfaceRef.current = null
        setTourSurface(null)
        return
      }
      tourSurfaceRef.current = surface
      setTourSurface(surface)
      window.clearTimeout(hoverTimer.current)
      openedByHover.current = false
      clickedGroup.current = null
      focusColumn.current = null
      setFrequent(frequentItems())
      if (window.matchMedia?.('(max-width: 1023px)').matches ?? window.innerWidth < 1024) {
        setOpenGroup(null)
        setMobileMenuOpen(true)
      } else {
        setMobileMenuOpen(false)
        setOpenGroup(surface === 'account' ? null : surface === 'menu' ? 'club' : surface)
      }
    }
    window.addEventListener(TOUR_SURFACE_EVENT, onTourSurface)
    return () => window.removeEventListener(TOUR_SURFACE_EVENT, onTourSurface)
  }, [])

  // Panel open: Escape and a press outside close it.
  useEffect(() => {
    if (!openGroup) return undefined
    const onDocDown = (event: MouseEvent) => {
      if (tourSurfaceRef.current) return
      const target = event.target as Node
      if (panelRef.current?.contains(target) || groupNavRef.current?.contains(target)) return
      setOpenGroup(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (tourSurfaceRef.current) return
      if (event.key !== 'Escape') return
      // Hand focus back only if it is in the menu: a hover-opened panel must not take it from a field being typed in.
      const focus = document.activeElement
      const inMenu = !!focus && (panelRef.current?.contains(focus) || groupNavRef.current?.contains(focus))
      setOpenGroup(null)
      if (inMenu) groupToggleRefs.current[openGroup]?.focus()
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openGroup])

  // After the keyboard opened a group, put focus on its first entry.
  useEffect(() => {
    if (!openGroup || focusColumn.current !== openGroup) return
    focusColumn.current = null
    panelRef.current?.querySelector<HTMLElement>(`[data-nav-col="${openGroup}"] button`)?.focus()
  }, [openGroup])

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
    window.clearTimeout(hoverTimer.current)
    setMobileMenuOpen(false)
    setOpenGroup(null)
    goPageTop(to, options)
  }

  // A menu entry. Member pages wait for the login check, then go on to the guide for a guest.
  const goMenuPath = (path: string, { auth = false } = {}) => {
    if (auth && authLoading) return
    // /lab/ is a separate app reached by a full page load, so the router never sees it.
    if (isFullPageLink(path)) countNavVisit(path)
    closeAndGo(path)
  }

  const handleLogout = async () => {
    if (!(await confirmEditorLeave())) return
    // logout() resolves false when the server could not be reached: the member is still signed
    // in (and has been told so), so they stay where they are.
    const loggedOut = await logout()
    setMobileMenuOpen(false)
    if (loggedOut !== false) goPageTop('/')
  }

  const showPanel = (groupId: string, byHover: boolean) => {
    window.clearTimeout(hoverTimer.current)
    if (!openGroup) setFrequent(frequentItems())
    // Hovering on to another group keeps the way the panel was opened: a click-opened panel stays click-opened.
    if (!byHover || !openGroup) openedByHover.current = byHover
    setOpenGroup(groupId)
  }

  const scheduleClose = (event: React.PointerEvent) => {
    if (tourSurfaceRef.current) return
    // Only a hover-opened panel closes when the pointer leaves; a clicked or keyboard-opened one stays.
    if (event.pointerType !== 'mouse' || !openedByHover.current) return
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setOpenGroup(null), HOVER_CLOSE_MS)
  }

  const onGroupClick = (event: React.MouseEvent, groupId: string) => {
    // A second click on the group that was itself clicked closes the panel. A group the pointer only
    // moved on to (the panel follows the pointer at once) is being chosen now, so it stays open.
    if (openGroup === groupId && clickedGroup.current === groupId) {
      window.clearTimeout(hoverTimer.current)
      clickedGroup.current = null
      setOpenGroup(null)
      return
    }
    clickedGroup.current = groupId
    // detail is 0 for Enter and Space: a keyboard user continues inside the panel.
    if (event.detail === 0) focusColumn.current = groupId
    showPanel(groupId, false)
  }

  const onGroupEnter = (event: React.PointerEvent, groupId: string) => {
    if (tourSurfaceRef.current) return
    if (event.pointerType !== 'mouse') return
    window.clearTimeout(hoverTimer.current)
    if (openGroup === groupId) return
    hoverTimer.current = window.setTimeout(() => showPanel(groupId, true), openGroup ? 0 : HOVER_OPEN_MS)
  }

  const onPanelBlur = (event: React.FocusEvent) => {
    if (tourSurfaceRef.current) return
    const next = event.relatedTarget as Node | null
    if (next && !panelRef.current?.contains(next) && !groupNavRef.current?.contains(next)) setOpenGroup(null)
  }

  const openMobileMenu = () => {
    setFrequent(frequentItems())
    setMobileMenuOpen(true)
  }

  const itemButton = (item: NavItem, className: string) => (
    <button
      type="button"
      className={className}
      data-tour-path={item.path}
      data-nav-activity={item.activityGroup}
      aria-current={activePath === item.path ? 'page' : undefined}
      disabled={item.auth && authLoading}
      onClick={() => goMenuPath(item.path, { auth: item.auth })}
    >
      <item.icon size={15} aria-hidden="true" className="nav-item-icon" />
      <span className="nav-item-label">{item.label}</span>
      {item.auth && <MemberLock />}
      <span className="nav-item-sub" aria-hidden="true">{item.sub}</span>
    </button>
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
    <header className={`apple-global-nav fixed inset-x-0 top-0 z-[80] ${scrolled ? 'is-scrolled' : ''} ${openGroup ? 'is-panel-open' : ''}`}>
      {/* From lg up the bar is a 1fr / auto / 1fr grid: the four groups stay optically centred
          while there is room and are pushed aside, never painted over, when the account cluster
          needs more width. Below lg the hamburger menu takes over. The bar is not positioned, so the
          panel (a child of it, for tab order) is placed against the header instead. */}
      <div className={`${floatingBarBaseClass} mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-6 2xl:px-8`}>
        <button
          type="button"
          onClick={() => goPageTop('/')}
          className="apple-global-nav-brand flex min-w-0 items-center gap-3 text-left lg:min-w-max lg:justify-self-start"
          aria-label="홈으로 이동"
        >
          <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="h-6 w-6 shrink-0 object-contain" />
          <span className="whitespace-nowrap text-sm font-bold text-[var(--app-text)]">KW COM&apos;s</span>
        </button>

        <nav
          ref={groupNavRef}
          aria-label="주요 메뉴"
          className="nav-groups hidden lg:flex"
          onPointerLeave={scheduleClose}
        >
          {navGroups.map((group) => {
            const open = openGroup === group.id
            const active = activeGroupId === group.id
            return (
              <button
                key={group.id}
                ref={(node) => { groupToggleRefs.current[group.id] = node }}
                type="button"
                data-tour={`nav-${group.id}`}
                data-active={active ? 'true' : undefined}
                aria-current={active ? 'true' : undefined}
                aria-expanded={open}
                aria-controls="nav-panel"
                className="nav-group-btn"
                onClick={(event) => onGroupClick(event, group.id)}
                onPointerEnter={(event) => onGroupEnter(event, group.id)}
              >
                <span data-nav-label className="nav-group-label">{group.label}</span>
              </button>
            )
          })}
        </nav>

        {openGroup && (
          <div
            ref={panelRef}
            id="nav-panel"
            data-tour-guided={tourSurface !== null ? 'true' : undefined}
            className="nav-panel hidden lg:block"
            onPointerEnter={() => window.clearTimeout(hoverTimer.current)}
            onPointerLeave={scheduleClose}
            onBlur={onPanelBlur}
          >
            <nav aria-label="전체 메뉴" className="nav-panel-inner">
              {frequent.length > 0 && (
                <div className="nav-frequent">
                  <p className="nav-frequent-title">자주 가는 곳</p>
                  <ul>
                    {frequent.map((item) => <li key={item.id}>{itemButton(item, 'nav-chip')}</li>)}
                  </ul>
                </div>
              )}
              <div className="nav-cols">
                {navGroups.map((group) => (
                  <section
                    key={group.id}
                    data-nav-col={group.id}
                    data-tour-group={group.id}
                    data-open={group.id === openGroup ? 'true' : undefined}
                    aria-labelledby={`nav-col-${group.id}`}
                    className="nav-col"
                  >
                    <p id={`nav-col-${group.id}`} className="nav-col-title">{group.label}<span>{group.sub}</span></p>
                    <ul>
                      {group.items.map((item) => <li key={item.id}>{itemButton(item, 'nav-item')}</li>)}
                    </ul>
                  </section>
                ))}
              </div>
            </nav>
          </div>
        )}

        {user ? (
          <div className="hidden items-center gap-1 lg:flex lg:justify-self-end">
            <QuickSearchPill />
            <NotificationButton />
            <button
              type="button"
              onClick={() => goPageTop('/settings')}
              data-tour="account"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] text-[11px] font-bold text-[var(--app-text)] transition hover:bg-black/5 xl:size-auto xl:max-w-[5.5rem] 2xl:max-w-[9rem] xl:border-transparent xl:bg-transparent xl:px-2.5 xl:py-1 xl:text-xs xl:font-semibold xl:text-[var(--app-muted)] xl:hover:text-[var(--app-text)]"
              title={`${user.name} · 계정 설정`}
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
            <QuickSearchPill />
            <button
              type="button"
              onClick={() => goPageTop('/login')}
              data-tour="login"
              disabled={authLoading}
              className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[var(--app-accent)] px-4 py-1 text-xs font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-wait disabled:opacity-70"
            >
              로그인
            </button>
          </div>
        )}

        <div className="flex items-center lg:hidden">
          <button type="button" onClick={openQuickSearch} data-tour="quick-search" className="coms-quick-open size-11" aria-label="빠른 이동 열기">
            <Search size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={openMobileMenu}
            data-tour="mobile-menu"
            className="apple-global-nav-menu lg:hidden"
            aria-label="메뉴 열기"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            <Menu size={22} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <MobileNavMenu
          guidedPreview={tourSurface !== null}
          frequent={frequent}
          activePath={activePath}
          onGo={(path, options) => goMenuPath(path, options)}
          onLogout={handleLogout}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}

      {showMobileTabs && (
        <nav className="apple-mobile-tabs md:hidden" aria-label="상세 화면 이동">
          {MOBILE_TABS.map((tab) => {
            const active = activePath === tab.path
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => closeAndGo(tab.path)}
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
