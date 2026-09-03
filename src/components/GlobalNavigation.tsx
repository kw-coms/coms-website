import { useEffect, useRef, useState } from 'react'
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
  Sparkles,
  X,
} from 'lucide-react'
import { getLogoAsset } from '../utils/logoAssets'
import { useAuth } from '../contexts/useAuth'
import {
  tabs,
  navExtraItems,
  activitySectionNavItems,
} from '../data/homeContent'
import { scrollToTopInstant } from '../utils/themeColors'
import NotificationButton from './NotificationButton'
import { ROLE_LABELS, canAccessOperationsPanel } from '../utils/roleAccess'

const floatingBarBaseClass = 'apple-topbar border-b border-[var(--app-hairline)]'

function getTabRoute(id) {
  return id === 'recruit' ? '/recruit' : `/${id}`
}

function getActiveNavKey(pathname) {
  if (pathname === '/about') return 'about'
  if (pathname === '/activities') return 'activities'
  if (pathname === '/activity-log') return 'activity-log'
  if (pathname === '/activity-events') return 'activity-events'
  if (pathname === '/monthly-calendar') return 'monthly-calendar'
  if (pathname === '/projects') return 'projects'
  if (pathname === '/apps') return 'apps'
  if (pathname.startsWith('/recruit')) return 'recruit'
  if (pathname.startsWith('/notices')) return 'notices'
  if (pathname.startsWith('/sponsors')) return 'sponsors'
  if (pathname.startsWith('/resources')) return 'resources'
  if (pathname.startsWith('/community')) return 'community'
  return null
}

export default function GlobalNavigation() {
  const { user, loading: authLoading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [mobileActivityOpen, setMobileActivityOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [showTop, setShowTop] = useState(false)
  const activityWrapperRef = useRef(null)
  const activeKey = getActiveNavKey(location.pathname)
  const mobileTabs = tabs.slice(0, 3)
  const showMobileTabs = mobileTabs.some((tab) => tab.id === activeKey)
  const primaryNavItems = tabs.map((tab) => ({ ...tab, path: getTabRoute(tab.id) }))
  const noticesNavItem = navExtraItems.find((item) => item.id === 'notices')
  const memberNavItems = navExtraItems.filter((item) => item.id !== 'notices')
  const activityNavActive = activitySectionNavItems.some((item) => item.id === activeKey)

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
        document.documentElement.style.setProperty('--scroll-progress', (max > 0 ? y / max : 0).toFixed(4))
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
    if (!activityOpen) return undefined
    const onDocClick = (event) => {
      if (activityWrapperRef.current && !activityWrapperRef.current.contains(event.target)) setActivityOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setActivityOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [activityOpen])

  useEffect(() => {
    if (!location.hash) return undefined
    const sectionId = decodeURIComponent(location.hash.slice(1))
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash, location.pathname])

  const goPageTop = (to: To, options?: NavigateOptions) => {
    scrollToTopInstant()
    navigate(to, options)
  }

  const closeAndGo = (to: To, options?: NavigateOptions) => {
    setMobileMenuOpen(false)
    setMobileActivityOpen(false)
    goPageTop(to, options)
  }

  const goProtected = (to) => {
    if (authLoading) return
    closeAndGo(to)
  }

  const goNavItem = (item) => {
    const target = `${item.path}${item.hash || ''}`
    setActivityOpen(false)
    if (item.auth) {
      goProtected(target)
      return
    }
    goPageTop(target)
  }

  const handleLogout = async () => {
    await logout()
    setMobileMenuOpen(false)
    goPageTop('/')
  }

  const navClass = (key, active = activeKey === key) => (
    `relative px-1 text-xs font-semibold transition ${
      active
        ? 'text-[var(--app-text)]'
        : 'text-[var(--app-muted)] hover:text-[var(--app-text)]'
    }`
  )

  return (
    <>
    <div className="coms-scroll-progress" aria-hidden="true" />
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`coms-to-top ${showTop ? 'is-visible' : ''}`}
      aria-label="맨 위로"
    >
      <ChevronDown size={20} className="rotate-180" />
    </button>
    <header className={`apple-global-nav fixed inset-x-0 top-0 z-[80] ${scrolled ? 'is-scrolled' : ''}`}>
      <div className={`${floatingBarBaseClass} relative mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8`}>
        <button
          type="button"
          onClick={() => goPageTop('/')}
          className="apple-global-nav-brand flex min-w-0 items-center gap-3 text-left"
          aria-label="홈으로 이동"
        >
          <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="h-6 w-6 shrink-0 object-contain" />
          <span className="whitespace-nowrap text-sm font-bold text-[var(--app-text)]">KW COM&apos;s</span>
        </button>

        <nav className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-3 lg:gap-5 md:flex">
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
          <div ref={activityWrapperRef} className="relative">
            <button
              type="button"
              onClick={() => setActivityOpen((open) => !open)}
              className={`${navClass('activity', activityNavActive)} inline-flex items-center gap-1`}
              aria-haspopup="menu"
              aria-expanded={activityOpen}
            >
              Activity
              <ChevronDown size={12} className={`transition ${activityOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {activityOpen && (
              <div
                role="menu"
                className="absolute left-1/2 top-full z-[90] mt-4 w-64 -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--app-hairline)] bg-[var(--app-surface)] shadow-[0_18px_45px_rgba(0,0,0,0.12)]"
              >
                <ul className="flex flex-col py-1">
                  {activitySectionNavItems.map((item) => (
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
              </div>
            )}
          </div>
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
          <div className="ml-auto hidden items-center gap-1 md:flex">
            <NotificationButton />
            <button type="button" onClick={() => goPageTop('/settings')} className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-black/5 hover:text-[var(--app-text)]" title="계정 설정">{user.name}</button>
            {canAccessOperationsPanel(user.role) && (
              <button type="button" onClick={() => goPageTop('/admin')} className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-bold text-[var(--app-accent-text)] transition hover:border-[var(--app-accent-border,rgba(0,113,227,0.4))]">
                {ROLE_LABELS[user.role] || '임원'}
              </button>
            )}
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-black/5 hover:text-[var(--app-text)]">
              <LogOut size={14} />
              Logout
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => goPageTop('/login')}
            disabled={authLoading}
            className="ml-auto hidden shrink-0 whitespace-nowrap rounded-full bg-[var(--app-accent)] px-4 py-1 text-xs font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-wait disabled:opacity-70 md:inline-flex"
          >
            로그인
          </button>
        )}

        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="apple-global-nav-menu md:hidden"
          aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          aria-haspopup="menu"
        >
          {mobileMenuOpen ? <X size={21} strokeWidth={2.1} /> : <Menu size={22} strokeWidth={2.25} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          role="menu"
          className="apple-mobile-menu-panel mx-auto md:hidden"
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
            <button
              type="button"
              onClick={() => setMobileActivityOpen((open) => !open)}
              aria-expanded={mobileActivityOpen}
              aria-controls="mobile-activity-panel"
              className="apple-mobile-menu-item"
            >
              <CalendarDays size={15} className="text-sky-500" />
              <span>Activity</span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--app-muted)]">
                기록·일정
                <ChevronDown
                  size={14}
                  className={`transition ${mobileActivityOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </span>
            </button>
            {mobileActivityOpen && (
              <div id="mobile-activity-panel" className="flex flex-col divide-y divide-[var(--app-hairline)] bg-black/[0.015]">
                {activitySectionNavItems.map((item) => (
                  <button
                    key={item.id}
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
                ))}
              </div>
            )}
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
                  {canAccessOperationsPanel(user.role) && (
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
        </div>
      )}

      {showMobileTabs && (
        <nav className="apple-mobile-tabs md:hidden" aria-label="상세 화면 이동">
          {mobileTabs.map((tab) => {
            const active = activeKey === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => closeAndGo(getTabRoute(tab.id))}
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
