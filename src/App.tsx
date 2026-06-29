import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  CircuitBoard,
  Grid3x3,
  LogOut,
  Menu,
  Megaphone,
  Moon,
  Plus,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { listNotices } from './services/noticeApi'
import { getNotificationSummary, listNotifications, markAllNotificationsRead, markNotificationRead } from './services/notificationApi'
import { listFonts } from './services/fontApi'
import { BUILT_IN_FONTS, buildFontFaceCss, fontFamilyValue, injectBuiltinFontStylesheets } from './services/fontPreferences'
const Archive = lazy(() => import('./pages/Archive'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Notices = lazy(() => import('./pages/Notices'))
const Admin = lazy(() => import('./pages/Admin'))
const Community = lazy(() => import('./pages/Community'))
const CommunityBookmarks = lazy(() => import('./pages/community/CommunityBookmarks'))
const CommunityMemberProfile = lazy(() => import('./pages/community/CommunityMemberProfile'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))
const RecruitApply = lazy(() => import('./pages/RecruitApply'))
const RecruitNotice = lazy(() => import('./pages/RecruitNotice'))
import { getLogoAsset } from './utils/logoAssets'
import { useAuth } from './contexts/useAuth'
import {
  tabs,
  activityDetails,
  projectDetails,
  heroHighlights,
  experiencePills,
  showcaseItems,
  activityHubItems,
  sectionMetrics,
  visualDetails,
  sectionMeta,
  sectionStories,
  aboutDetailCards,
  aboutDetailFlow,
  aboutDetailPrinciples,
  activitiesDetailCards,
  activitiesDetailFlow,
  activitiesDetailTopics,
  projectsDetailCards,
  projectsDetailFlow,
  projectsDetailOutputs,
  accentSwatches,
  footerLinkGroups,
  navExtraItems,
  activitySectionNavItems,
} from './data/homeContent'
import PageFallback from './components/home/PageFallback'
const ComsIntro = lazy(() => import('./components/common/ComsIntro'))
import { ToastHost } from './components/common/Toast'
import CompanionServicesSection from './components/home/CompanionServicesSection'
import { ghostActionBtnClass, solidActionBtnClass } from './shared/homeUi'
import ActivityLogSection from './features/activityLog/ActivityLogSection'
import ClubEventSection from './features/clubEvent/ClubEventSection'
import ClubCalendarSection from './features/clubCalendar/ClubCalendarSection'

const NOTIFICATIONS_QUERY_KEY = ['app-shell', 'notifications']
const FONTS_QUERY_KEY = ['app-shell', 'fonts']
const LATEST_NOTICE_QUERY_KEY = ['app-shell', 'latest-notice']

const floatingBarBaseClass = 'apple-topbar border-b border-[var(--app-hairline)]'
const DETAIL_TITLE_MIN_FIT = 0.74

const DEFAULT_ACCENT = '#0071e3'
const THEME_MODE_KEY = 'kwcoms-theme-mode'
const ACCENT_COLOR_KEY = 'kwcoms-accent-color'
const FONT_SELECTION_KEY = 'kwcoms-font-id'

function getStoredFontId() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(FONT_SELECTION_KEY)
  if (!raw) return null
  if (raw.startsWith('b:')) return raw
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

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
  if (pathname.startsWith('/resources')) return 'resources'
  if (pathname.startsWith('/community')) return 'community'
  return null
}

function normalizeHex(value) {
  if (typeof value !== 'string') return DEFAULT_ACCENT
  const trimmed = value.trim()
  const shorthand = /^#?([0-9a-f]{3})$/i.exec(trimmed)
  if (shorthand) {
    return `#${shorthand[1].split('').map((char) => char + char).join('').toLowerCase()}`
  }
  const full = /^#?([0-9a-f]{6})$/i.exec(trimmed)
  return full ? `#${full[1].toLowerCase()}` : DEFAULT_ACCENT
}

function hexToRgb(hex) {
  const value = normalizeHex(hex).slice(1)
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: any) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

function mixHex(base, overlay, overlayRatio) {
  const baseRgb = hexToRgb(base)
  const overlayRgb = hexToRgb(overlay)
  const ratio = Math.min(Math.max(overlayRatio, 0), 1)
  return rgbToHex({
    r: baseRgb.r * (1 - ratio) + overlayRgb.r * ratio,
    g: baseRgb.g * (1 - ratio) + overlayRgb.g * ratio,
    b: baseRgb.b * (1 - ratio) + overlayRgb.b * ratio,
  })
}

function getStoredThemeMode() {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_MODE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredAccentColor() {
  if (typeof window === 'undefined') return DEFAULT_ACCENT
  return normalizeHex(window.localStorage.getItem(ACCENT_COLOR_KEY) || DEFAULT_ACCENT)
}

function scrollToTopInstant() {
  if (typeof window === 'undefined') return
  const root = document.documentElement
  const previousBehavior = root.style.scrollBehavior
  root.style.scrollBehavior = 'auto'
  window.scrollTo(0, 0)
  root.style.scrollBehavior = previousBehavior
}

// ─── Auth guards ───────────────────────────────────────────────────────────

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    scrollToTopInstant()
  }, [pathname])

  return null
}

function RequireAuth({ children }: any) {
  const { user, loading, authError, retryAuth } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center text-[var(--app-muted)] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        로그인 상태를 확인하는 중...
      </div>
    </PageShell>
  )
  if (authError) return (
    <PageShell>
      <div className="mx-auto max-w-md rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">{authError.message}</p>
        <button type="button" onClick={retryAuth} className="mt-4 apple-action-primary px-5 py-2 text-sm">
          다시 시도
        </button>
      </div>
    </PageShell>
  )
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RequireAdmin({ children }: any) {
  const { user, loading, authError, retryAuth } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center text-[var(--app-muted)] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        로그인 상태를 확인하는 중...
      </div>
    </PageShell>
  )
  if (authError) return (
    <PageShell>
      <div className="mx-auto max-w-md rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">{authError.message}</p>
        <button type="button" onClick={retryAuth} className="mt-4 apple-action-primary px-5 py-2 text-sm">
          다시 시도
        </button>
      </div>
    </PageShell>
  )
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}

// ─── Page route wrappers ────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromLocation = location.state?.from
  const successPath = fromLocation
    ? `${fromLocation.pathname || '/'}${fromLocation.search || ''}${fromLocation.hash || ''}`
    : '/'
  return (
    <PageShell>
      <Login
        onCancel={() => navigate('/', { replace: true })}
        onSuccess={() => navigate(successPath, { replace: true })}
        goSignup={() => navigate('/signup')}
      />
    </PageShell>
  )
}

function SignupPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Signup onBack={() => navigate('/login')} />
    </PageShell>
  )
}

function NoticesPage() {
  return (
    <PageShell wide full>
      <Notices />
    </PageShell>
  )
}

function ArchivePage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Archive onBack={() => navigate('/')} />
    </PageShell>
  )
}

function CommunityPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Community onBack={() => navigate('/')} />
    </PageShell>
  )
}

function CommunityBookmarksPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <CommunityBookmarks onBack={() => navigate('/community')} />
    </PageShell>
  )
}

function CommunityMemberProfilePage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <CommunityMemberProfile onBack={() => navigate('/community')} />
    </PageShell>
  )
}

function AdminPage() {
  const navigate = useNavigate()
  return (
    <PageShell>
      <Admin onBack={() => navigate('/')} />
    </PageShell>
  )
}

function SettingsPage() {
  const navigate = useNavigate()
  return (
    <PageShell>
      <ChangePassword onBack={() => navigate('/')} />
    </PageShell>
  )
}

function RecruitPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full transition={false}>
      <RecruitApply onBack={() => navigate('/')} />
    </PageShell>
  )
}

function RecruitNoticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'
  const goApply = () => {
    scrollToTopInstant()
    navigate('/recruit')
  }

  return (
    <PageShell wide full transition={false}>
      <RecruitNotice onBack={() => navigate(from, { replace: true })} onApply={goApply} />
    </PageShell>
  )
}

function GlobalNavigation() {
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

  const goPageTop = (to, options?: any) => {
    scrollToTopInstant()
    navigate(to, options)
  }

  const closeAndGo = (to, options?: any) => {
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
            {user.role === 'ADMIN' && (
              <button type="button" onClick={() => goPageTop('/admin')} className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#b45309] transition hover:bg-amber-100/70">관리자</button>
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
            {primaryNavItems.map((item: any) => (
              <button key={item.id} type="button" onClick={() => closeAndGo(`${item.path}${item.hash || ''}`)} className="apple-mobile-menu-item">
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
                  {user.role === 'ADMIN' && (
                    <button type="button" onClick={() => closeAndGo('/admin')} className="apple-mobile-menu-item apple-mobile-menu-item-warning">
                      <span>관리자 패널</span>
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

const EMPTY_NOTIFICATIONS = { items: [], unreadCount: 0 }

function NotificationButton({ alignLeft = false, variant = 'icon' }: any) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState({})
  const btnRef = useRef(null)
  const dropdownRef = useRef(null)
  const effectiveOpen = open && Boolean(user)

  const notificationsQuery = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      const [list, summary] = await Promise.all([listNotifications(), getNotificationSummary()])
      return {
        items: Array.isArray(list) ? list : [],
        unreadCount: summary?.unreadCount || 0,
      }
    },
    enabled: Boolean(user),
    // Match the previous behavior: a failed fetch shows an empty list, never an error UI.
    placeholderData: (previous) => previous,
  })

  const { items, unreadCount } = notificationsQuery.data ?? EMPTY_NOTIFICATIONS

  const openNotification = async (item) => {
    try {
      await markNotificationRead(item.id)
      queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, (prev: any) => {
        const base = prev ?? EMPTY_NOTIFICATIONS
        return {
          items: base.items.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
          unreadCount: Math.max(0, base.unreadCount - (item.read ? 0 : 1)),
        }
      })
    } catch {
      // Navigation should still work if the read marker fails.
    }
    setOpen(false)
    const safeAcceptUrl = typeof item.acceptUrl === 'string' && /^https?:\/\//i.test(item.acceptUrl)
    if (safeAcceptUrl) {
      window.open(item.acceptUrl, '_blank', 'noopener,noreferrer')
    } else if (item.type === 'COMMUNITY_POST_DELETED') {
      navigate('/community?view=deleted')
    } else if (item.type === 'RECRUIT_APPLICATION') {
      navigate('/admin?tab=recruit')
    } else if (item.noticeId) {
      navigate(`/notices/${item.noticeId}`)
    } else if (item.postId) {
      navigate(`/community/${item.postId}${item.commentId ? `#comment-${item.commentId}` : ''}`)
    }
  }

  const readAll = async () => {
    await markAllNotificationsRead()
    queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, (prev: any) => {
      const base = prev ?? EMPTY_NOTIFICATIONS
      return { items: base.items.map((item) => ({ ...item, read: true })), unreadCount: 0 }
    })
  }

  const positionDropdown = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const dropdownWidth = dropdownRef.current?.offsetWidth || Math.min(352, window.innerWidth - 32)
    const dropdownHeight = dropdownRef.current?.offsetHeight || 0
    const left = alignLeft
      ? Math.min(Math.max(16, rect.left), window.innerWidth - dropdownWidth - 16)
      : Math.min(Math.max(16, rect.right - dropdownWidth), window.innerWidth - dropdownWidth - 16)
    const below = rect.bottom + 8
    const top = below + dropdownHeight <= window.innerHeight - 16
      ? below
      : Math.max(16, rect.top - dropdownHeight - 8)
    setDropdownStyle({ top, left })
  }, [alignLeft])

  useEffect(() => {
    if (!effectiveOpen) return undefined
    positionDropdown()
    window.addEventListener('scroll', positionDropdown, true)
    window.addEventListener('resize', positionDropdown)
    return () => {
      window.removeEventListener('scroll', positionDropdown, true)
      window.removeEventListener('resize', positionDropdown)
    }
  }, [effectiveOpen, positionDropdown])

  const toggle = () => {
    setOpen((v) => !v)
    if (user) notificationsQuery.refetch()
  }

  if (!user) return null
  const mobileMenu = variant === 'mobileMenu'

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={mobileMenu
          ? 'apple-mobile-menu-item apple-mobile-menu-notification'
          : 'relative inline-flex size-8 items-center justify-center rounded-full text-[var(--theme-body-dark)] transition hover:bg-black/5'}
        aria-label="notifications"
      >
        {mobileMenu ? (
          <>
            <Bell size={15} className="text-blue-500" />
            <span>알림</span>
            <span className="ml-auto text-xs text-[var(--app-muted)]">
              {unreadCount > 0 ? (
                <span className="inline-flex min-w-5 justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : '새 알림 없음'}
            </span>
          </>
        ) : (
          <>
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </>
        )}
      </button>
      {effectiveOpen && createPortal(
        <div
          ref={dropdownRef}
          className="theme-popover fixed z-[9999] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--theme-body-dark)] shadow-2xl"
          style={dropdownStyle}
        >
          <div className="flex items-center justify-between border-b border-[var(--app-hairline)] px-4 py-3">
            <span className="text-sm font-black">알림</span>
            <button type="button" onClick={readAll} className="text-xs font-bold text-[#3b4890] hover:underline">모두 읽음</button>
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--theme-body-muted)]">새 알림이 없습니다.</p>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openNotification(item)}
                className={`notification-row block w-full border-b border-black/8 px-4 py-3 text-left text-sm last:border-b-0 ${item.read ? 'notification-row-read' : 'notification-row-unread'}`}
              >
                <span className="flex items-start gap-2">
                  <span className="notification-dot mt-1.5" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {item.actorLabel && (
                      <span className="mb-1 inline-block rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--theme-body-muted)]">{item.actorLabel}</span>
                    )}
                    <span className={`block ${item.read ? 'font-medium' : 'font-bold'}`}>{item.message}</span>
                    {item.acceptUrl && (
                      <span className="mt-1 block text-[11px] font-bold text-[#3b4890]">눌러서 수락하러 가기 →</span>
                    )}
                    <span className="mt-1 block text-[11px] text-[var(--theme-body-muted)]">{new Date(item.createdAt).toLocaleString('ko-KR')}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function AppearanceControl({
  accentColor,
  setAccentColor,
  themeMode,
  setThemeMode,
  activeFonts = [],
  selectedFontId = null,
  onFontChange,
  fontSelectionLocked = false,
  onOpenAccountSettings,
}: any) {
  const accent = normalizeHex(accentColor)
  const isDark = themeMode === 'dark'
  const fontSelectValue = selectedFontId ? String(selectedFontId) : ''

  return (
    <section className="appearance-control apple-footer-surface border-t border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-5 py-8 text-[var(--app-muted)]">
      <div className="mx-auto w-full max-w-5xl">
        <div className="apple-footer-note border-b border-[var(--app-hairline)] pb-5 text-xs leading-5">
          <p>KW COM&apos;s는 광운대학교 학생들이 함께 공부하고 프로젝트를 만드는 중앙 컴퓨터 학술동아리입니다.</p>
          <p className="mt-2">활동 안내와 모집 일정은 공지사항을 통해 순차적으로 공개됩니다.</p>
        </div>

        <div className="appearance-panel grid gap-4 border-b border-[var(--app-hairline)] py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-subtle)]">Appearance</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--app-text)]">화면 설정</h2>
          </div>

          <div className="appearance-actions flex min-w-0 flex-col gap-3 lg:items-end">
            <button
              type="button"
              onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
              className="appearance-mode-toggle inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)] sm:w-auto"
              aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              <span className="grid size-6 place-items-center rounded-full bg-[var(--app-surface-soft)] text-[var(--app-text)]">
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </span>
              {isDark ? '라이트 모드' : '다크 모드'}
            </button>

            {activeFonts.length > 0 && (
              <div className="appearance-font-row flex flex-wrap items-center gap-2 lg:justify-end" aria-label="폰트 설정">
                <span className="mr-1 text-xs font-semibold text-[var(--app-muted)]">폰트</span>
                <span className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--app-muted)]">
                  {fontSelectionLocked ? '내 계정에 저장됨' : '이 브라우저에 임시 적용'}
                </span>
                {fontSelectionLocked ? (
                  <button
                    type="button"
                    onClick={onOpenAccountSettings}
                    className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-[var(--app-surface-elevated)] hover:text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/30"
                  >
                    계정 설정에서 폰트 변경
                  </button>
                ) : (
                  <select
                    value={fontSelectValue}
                    onChange={(event) => onFontChange?.(event.target.value)}
                    className="min-h-9 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] outline-none transition focus:ring-2 focus:ring-[var(--app-accent)]/30"
                    aria-label="사이트 폰트 선택"
                  >
                    <option value="">기본 폰트</option>
                    {activeFonts.map((font) => (
                      <option key={font.id} value={font.id}>{font.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="appearance-color-row flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="mr-1 text-xs font-semibold text-[var(--app-muted)]">색상</span>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] p-1.5">
                {accentSwatches.map((swatch) => {
                  const active = accent === swatch.value
                  return (
                    <button
                      key={swatch.value}
                      type="button"
                      onClick={() => setAccentColor(swatch.value)}
                      className={`relative grid size-11 min-h-11 min-w-11 place-items-center rounded-full transition hover:scale-105 sm:size-8 sm:min-h-8 sm:min-w-8 ${active ? 'ring-2 ring-[var(--app-text)] ring-offset-2 ring-offset-[var(--app-surface)]' : ''}`}
                      style={{ backgroundColor: swatch.value }}
                      aria-label={`${swatch.name} 색상 선택`}
                      title={swatch.name}
                    >
                      {active && <span className="size-2.5 rounded-full bg-[var(--app-surface)] shadow-[0_1px_4px_rgba(0,0,0,0.28)] sm:size-2" />}
                    </button>
                  )
                })}
              </div>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)]">
                직접 선택
                <span className="relative grid size-5 overflow-hidden rounded-full border border-[var(--app-hairline)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]" style={{ backgroundColor: accent }}>
                  <input
                    type="color"
                    value={accent}
                    onChange={(event) => setAccentColor(event.target.value)}
                    className="absolute -inset-2 h-10 w-10 cursor-pointer opacity-0"
                    aria-label="커스텀 색상 선택"
                  />
                </span>
              </label>
              <button
                type="button"
                onClick={() => setAccentColor(DEFAULT_ACCENT)}
                className="min-h-9 rounded-full border border-[var(--app-hairline)] bg-transparent px-3 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="apple-footer-directory grid gap-x-10 gap-y-6 border-b border-[var(--app-hairline)] py-5 text-xs sm:grid-cols-3">
          {footerLinkGroups.map((group) => (
            <div key={group.title}>
              <h3 className="font-semibold text-[var(--app-text)]">{group.title}</h3>
              <ul className="mt-2 space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noreferrer' : undefined}
                      className="text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="apple-footer-bottom flex flex-col gap-3 pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright © {new Date().getFullYear()} KW COM&apos;s. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="/notices" className="hover:text-[var(--app-text)]">Notices</a>
            <a href="/community" className="hover:text-[var(--app-text)]">Community</a>
            <a href="mailto:kwcoms69@gmail.com" className="hover:text-[var(--app-text)]">Contact</a>
          </div>
        </div>
      </div>
    </section>
  )
}
function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="apple-detail-page theme-home relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--app-surface-soft)] px-6 text-center text-[var(--app-text)]">
      <div className="home-hero-surface absolute inset-0" />
      <div className="relative z-10 flex flex-col items-center">
        <img src={getLogoAsset('COMs_logo_vec')} alt="" className="coms-cinema-intrologo mb-8 w-20 sm:w-24" aria-hidden="true" />
        <p className="apple-display coms-3d-title coms-cinema-title text-7xl sm:text-8xl">404</p>
        <h1 className="mt-6 text-2xl font-bold text-[var(--app-text)] sm:text-3xl">페이지를 찾을 수 없어요</h1>
        <p className="apple-copy mt-3 max-w-md text-base text-[var(--app-muted)]">
          주소가 바뀌었거나 사라진 페이지일 수 있어요. 홈으로 돌아가 다시 찾아보세요.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => { scrollToTopInstant(); navigate('/') }} className={solidActionBtnClass}>홈으로</button>
          <button type="button" onClick={() => navigate(-1)} className={ghostActionBtnClass}>이전으로</button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [themeMode, setThemeMode] = useState(getStoredThemeMode)
  const [accentColor, setAccentColor] = useState(getStoredAccentColor)
  const [guestFontId, setGuestFontId] = useState(getStoredFontId)

  const fontsQuery = useQuery({
    queryKey: FONTS_QUERY_KEY,
    queryFn: async () => {
      const data = await listFonts()
      return Array.isArray(data) ? data : []
    },
  })
  const fontsData = fontsQuery.data
  const activeFonts = useMemo(() => fontsData ?? [], [fontsData])

  useEffect(() => {
    const root = document.documentElement
    const mode = themeMode === 'dark' ? 'dark' : 'light'
    const accent = normalizeHex(accentColor)

    root.dataset.themeMode = mode
    root.style.setProperty('--app-accent', accent)
    root.style.setProperty('--app-accent-hover', mixHex(accent, mode === 'dark' ? '#ffffff' : '#000000', mode === 'dark' ? 0.14 : 0.08))
    root.style.setProperty('--app-accent-soft', mixHex(accent, mode === 'dark' ? '#17191f' : '#ffffff', mode === 'dark' ? 0.8 : 0.88))
    root.style.setProperty('--app-accent-text', mode === 'dark' ? mixHex(accent, '#ffffff', 0.28) : mixHex(accent, '#000000', 0.08))
    root.style.setProperty('--app-accent-border', `color-mix(in srgb, ${accent} 42%, transparent)`)

    window.localStorage.setItem(THEME_MODE_KEY, mode)
    window.localStorage.setItem(ACCENT_COLOR_KEY, accent)
  }, [accentColor, themeMode])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const styleId = 'site-font-faces'
    let styleEl = document.getElementById(styleId)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = buildFontFaceCss(activeFonts)
    return undefined
  }, [activeFonts])

  useEffect(() => {
    injectBuiltinFontStylesheets()
  }, [])

  const combinedFonts = [...BUILT_IN_FONTS, ...activeFonts]
  const effectiveFontId = user ? (user.selectedBuiltinFontKey ?? user.selectedFontId) : guestFontId
  const selectedFont = combinedFonts.find((font) => String(font.id) === String(effectiveFontId))

  useEffect(() => {
    const root = document.documentElement
    if (selectedFont) {
      root.style.setProperty('--apple-font-family', fontFamilyValue(selectedFont))
    } else {
      root.style.removeProperty('--apple-font-family')
    }
  }, [selectedFont])

  const handleGuestFontChange = (value) => {
    if (!value) {
      setGuestFontId(null)
      window.localStorage.removeItem(FONT_SELECTION_KEY)
      return
    }
    if (String(value).startsWith('b:')) {
      setGuestFontId(value)
      window.localStorage.setItem(FONT_SELECTION_KEY, value)
      return
    }
    const id = Number(value)
    if (Number.isFinite(id) && id > 0) {
      setGuestFontId(id)
      window.localStorage.setItem(FONT_SELECTION_KEY, String(id))
    } else {
      setGuestFontId(null)
      window.localStorage.removeItem(FONT_SELECTION_KEY)
    }
  }

  const openAccountSettings = () => {
    navigate('/settings')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <a href="#main-content" className="coms-skip-link">본문으로 건너뛰기</a>
      {location.pathname === '/' && <ComsIntro />}
      <ScrollToTop />
      <GlobalNavigation />
      <div key={location.pathname} id="main-content" tabIndex={-1} className="coms-page-enter">
      <Routes location={location}>
        <Route path="/" element={<HomeView />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/activities" element={<ActivitiesDetailPage />} />
        <Route path="/activity-log" element={<RequireAuth><ActivityLogPage /></RequireAuth>} />
        <Route path="/activity-events" element={<RequireAuth><ClubEventPage /></RequireAuth>} />
        <Route path="/monthly-calendar" element={<RequireAuth><MonthlyCalendarPage /></RequireAuth>} />
        <Route path="/projects" element={<ProjectsDetailPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/notices" element={<RequireAuth><NoticesPage /></RequireAuth>} />
        <Route path="/notices/:id" element={<RequireAuth><NoticesPage /></RequireAuth>} />
        <Route path="/resources" element={<RequireAuth><ArchivePage /></RequireAuth>} />
        <Route path="/community" element={<RequireAuth><CommunityPage /></RequireAuth>} />
        <Route path="/community/bookmarks" element={<RequireAuth><CommunityBookmarksPage /></RequireAuth>} />
        <Route path="/community/members/:studentId" element={<RequireAuth><CommunityMemberProfilePage /></RequireAuth>} />
        <Route path="/community/:id" element={<RequireAuth><CommunityPage /></RequireAuth>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/recruit" element={<RecruitPage />} />
        <Route path="/recruit-notice" element={<RecruitNoticePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </div>
      <AppearanceControl
        accentColor={accentColor}
        setAccentColor={setAccentColor}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        activeFonts={combinedFonts}
        selectedFontId={effectiveFontId}
        onFontChange={handleGuestFontChange}
        fontSelectionLocked={Boolean(user)}
        onOpenAccountSettings={openAccountSettings}
      />
      <ToastHost />
    </Suspense>
  )
}

// ─── Home page ──────────────────────────────────────────────────────────────

function AboutPage() {
  return (
    <DetailStoryPage
      eyebrow="About COM's"
      title="함께 배우고, 바로 만듭니다."
      body="COM's는 광운대학교 학생들이 컴퓨터와 소프트웨어를 함께 공부하고, 실제 프로젝트로 연결하는 중앙 컴퓨터 학술동아리입니다."
      visualTitle="Club OS"
      visualSubtitle="Study · Build · Share"
      visualRows={['학습 로드맵', '프로젝트 트랙', '커뮤니티 로그']}
      cards={aboutDetailCards}
      flow={aboutDetailFlow}
      outputsEyebrow="Culture"
      outputsTitle="COM's가 오래 가져가는 태도."
      outputsBody="잘하는 사람만 모이는 곳보다, 함께 성장하는 방식을 계속 만드는 곳을 지향합니다."
      outputs={aboutDetailPrinciples}
    />
  )
}




function DetailStoryPage({
  eyebrow,
  title,
  body,
  visualTitle,
  visualSubtitle,
  visualRows,
  cards,
  flow,
  outputsEyebrow = 'Archive',
  outputsTitle,
  outputsBody = '학기마다 쌓인 활동은 다음 부원이 참고할 수 있는 자료와 경험으로 남습니다.',
  outputs,
}: any) {
  const navigate = useNavigate()
  const titleRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const titleEl = titleRef.current
    if (!titleEl) return undefined

    let active = true
    let frameId = 0

    const fitTitle = () => {
      if (!active) return
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        if (!active) return

        const phrases: any[] = Array.from(titleEl.querySelectorAll('.apple-detail-title-phrase'))
        if (phrases.length === 0) return

        const availableWidth = titleEl.clientWidth
        const currentFit = Number.parseFloat(getComputedStyle(titleEl).getPropertyValue('--apple-title-fit')) || 1
        const widestPhrase = phrases.reduce((max: number, phrase: any) => Math.max(max, phrase.scrollWidth / currentFit), 0)
        if (!availableWidth || !widestPhrase) return

        const nextFit = Math.min(1, Math.max(DETAIL_TITLE_MIN_FIT, (availableWidth - 2) / widestPhrase))
        if (Math.abs(nextFit - currentFit) > 0.004) {
          titleEl.style.setProperty('--apple-title-fit', nextFit.toFixed(3))
        }
      })
    }

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitTitle)
    resizeObserver?.observe(titleEl)

    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(fitTitle)
    mutationObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })

    const fontSet = document.fonts
    fontSet?.addEventListener?.('loadingdone', fitTitle)
    fontSet?.ready?.then(fitTitle).catch(() => {})
    window.addEventListener('resize', fitTitle)

    fitTitle()

    return () => {
      active = false
      window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      fontSet?.removeEventListener?.('loadingdone', fitTitle)
      window.removeEventListener('resize', fitTitle)
    }
  }, [title])

  return (
    <div className="apple-detail-page theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <main className="apple-detail-main relative overflow-hidden">
        <section className="apple-detail-hero relative grid min-h-[calc(88svh-44px)] items-center gap-12 overflow-hidden bg-[var(--app-surface-soft)] px-5 py-16 lg:grid-cols-[1fr_0.88fr] lg:px-12">
          <div className="home-hero-surface absolute inset-0" />
          <div className="relative z-10 mx-auto max-w-3xl text-center lg:text-left">
            <button type="button" onClick={() => navigate('/')} className="apple-detail-home-button mx-auto mb-8 lg:mx-0">
              <ArrowLeft size={15} />
              메인으로 돌아가기
            </button>
            <p className="apple-eyebrow">{eyebrow}</p>
            <h1 ref={titleRef} className="apple-display apple-detail-title mt-4">{title}</h1>
            <p className="apple-copy mt-6 text-xl sm:text-2xl">{body}</p>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-xl">
            <div className="apple-detail-visual rounded-lg bg-white/82 p-5 shadow-[0_32px_90px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-2xl">
              <div className="mb-7 flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#ffbd2e]" />
                <span className="size-3 rounded-full bg-[var(--app-accent)]" />
              </div>
              <div className="rounded-lg bg-[var(--app-surface-soft)] px-6 py-7">
                <p className="text-3xl font-semibold text-[var(--app-text)]">{visualTitle}</p>
                <p className="mt-2 text-base font-semibold text-[var(--app-muted)]">{visualSubtitle}</p>
              </div>
              <div className="mt-4 grid gap-3">
                {visualRows.map((row, index) => (
                  <div key={row} className="flex items-center gap-3 rounded-lg bg-[var(--app-surface)] px-4 py-3 text-sm font-semibold text-[var(--app-text)] shadow-[0_8px_24px_rgba(0,0,0,0.05)]">
                    <span className="size-2.5 rounded-full bg-[var(--app-accent)]" />
                    <span>{row}</span>
                    <span className="ml-auto text-xs text-[var(--app-subtle)]">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[var(--app-surface)] px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="apple-eyebrow">Inside</p>
              <h2 className="apple-display mt-4 text-5xl sm:text-6xl">무엇을 하고, 어떻게 이어가는지.</h2>
            </div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {cards.map(({ title: cardTitle, eyebrow: cardEyebrow, body: cardBody, icon: Icon }) => (
                <article key={cardTitle} className="apple-product-panel apple-detail-card min-h-[19rem] px-7 py-7">
                  <div className="mb-8 inline-flex size-11 items-center justify-center rounded-full bg-[var(--app-surface-soft)] text-[var(--app-accent-text)]">
                    <Icon size={20} />
                  </div>
                  <p className="apple-eyebrow">{cardEyebrow}</p>
                  <h3 className="mt-3 text-3xl font-semibold text-[var(--app-text)]">{cardTitle}</h3>
                  <p className="mt-4 text-[15px] font-medium leading-7 text-[var(--app-muted)]">{cardBody}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--app-surface-soft)] px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="apple-eyebrow text-center">Flow</p>
            <h2 className="apple-display mx-auto mt-4 max-w-4xl text-center text-5xl sm:text-6xl">작게 시작해서 오래 남기는 방식.</h2>
            <div className="mt-12 grid gap-3">
              {flow.map(([number, flowTitle, flowBody]) => (
                <article key={number} className="apple-flow-row grid gap-4 rounded-lg bg-[var(--app-surface)] px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:grid-cols-[5rem_1fr] sm:items-center">
                  <span className="text-3xl font-semibold text-[var(--app-accent-text)]">{number}</span>
                  <div>
                    <h3 className="text-2xl font-semibold text-[var(--app-text)]">{flowTitle}</h3>
                    <p className="mt-2 text-[15px] font-medium leading-7 text-[var(--app-muted)]">{flowBody}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--app-surface)] px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1fr] lg:items-center">
            <div>
              <p className="apple-eyebrow">{outputsEyebrow}</p>
              <h2 className="apple-display mt-4 text-5xl sm:text-6xl">{outputsTitle}</h2>
              <p className="apple-copy mt-5 text-xl">{outputsBody}</p>
            </div>
            <div className="grid gap-3">
              {outputs.map((item, index) => (
                <div key={item} className="apple-output-row flex items-center gap-4 rounded-lg bg-[var(--app-surface-soft)] px-5 py-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--app-surface)] text-sm font-semibold text-[var(--app-accent-text)]">{index + 1}</span>
                  <p className="text-lg font-semibold leading-7 text-[var(--app-text)]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function ActivitiesDetailPage() {
  return (
    <DetailStoryPage
      eyebrow="Activities"
      title={(
        <>
          <span className="apple-detail-title-phrase">배움이 매주 쌓이고,</span>{' '}
          <span className="apple-detail-title-phrase">서로에게 남습니다.</span>
        </>
      )}
      body="COM's의 활동은 정기 세미나, 분야별 스터디, 코드 리뷰, 작은 제작 과제가 이어지는 흐름입니다. 처음 시작하는 사람도 따라올 수 있고, 이미 경험이 있는 사람도 더 깊게 확장할 수 있습니다."
      visualTitle="Learning Stack"
      visualSubtitle="Seminar · Study · Review"
      visualRows={['정기 세미나', '분야별 스터디', '코드 리뷰']}
      cards={activitiesDetailCards}
      flow={activitiesDetailFlow}
      outputsTitle="활동이 남기는 기록."
      outputs={activitiesDetailTopics}
    />
  )
}

function ActivityLogPage() {
  return <ActivityLogSection />
}

function ClubEventPage() {
  return <ClubEventSection />
}

function MonthlyCalendarPage() {
  return <ClubCalendarSection />
}

function AppsPage() {
  return (
    <div className="apple-detail-page theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <main className="relative overflow-hidden pt-12">
        <CompanionServicesSection />
      </main>
    </div>
  )
}

function ProjectsDetailPage() {
  return (
    <DetailStoryPage
      eyebrow="Projects"
      title="아이디어를 실제 서비스와 제작물로."
      body="COM's의 프로젝트는 동아리 안에서 쓰이는 서비스, 교육용 실습, 웹 개발 결과물처럼 실제로 동작하는 결과물을 만드는 데 집중합니다. 기획부터 구현, 배포와 개선까지 팀으로 경험합니다."
      visualTitle="Project Lab"
      visualSubtitle="Prototype · Launch · Iterate"
      visualRows={['서비스 기획', '팀 구현', '배포와 개선']}
      cards={projectsDetailCards}
      flow={projectsDetailFlow}
      outputsTitle="프로젝트가 남기는 결과물."
      outputs={projectsDetailOutputs}
    />
  )
}

function HomeView() {
  const navigate = useNavigate()
  const location = useLocation()
  const aboutRef = useRef(null)
  const activitiesRef = useRef(null)
  const projectsRef = useRef(null)
  const recruitRef = useRef(null)
  const heroInnerRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const latestNoticeQuery = useQuery({
    queryKey: LATEST_NOTICE_QUERY_KEY,
    queryFn: listNotices,
    select: (data) => {
      const notices = Array.isArray(data) ? data : []
      return notices.find((n) => (n.category || 'GENERAL') === 'GENERAL') ?? null
    },
  })
  const latestNotice = latestNoticeQuery.data ?? null

  // Apple-style cinematic scroll: a giant COM's wordmark shrinks as you scroll,
  // the scene stays pinned (sticky) for a deliberate "pause", then the rest of
  // the content cascades in. Plus reveal-on-scroll for the sections below.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const root = document.querySelector('.theme-home')
    root?.classList.add('reveal-ready')
    // Gentle scroll-snap so the page "pauses" at each section (Kakao-style).
    document.documentElement.classList.add('home-snap-scroll')

    // Repeatable reveals: re-animate every time an element re-enters view, so
    // scrolling back up and down replays the motion.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-revealed', entry.isIntersecting)
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    const revealEls = Array.from(document.querySelectorAll('[data-reveal]'))
    revealEls.forEach((el) => io.observe(el))

    const track = trackRef.current
    // Reduced motion (or no track): jump straight to the settled final state.
    if (prefersReduced || !track) {
      if (track) {
        for (const [k, v] of [
          ['--hero-scale', '1'],
          ['--word-ty', '0px'],
          ['--word-o', '0'],
          ['--logo-p', '1'],
          ['--tag-p', '1'],
          ['--cta-p', '1'],
          ['--content-p', '1'],
        ] as const) {
          track.style.setProperty(k, v)
        }
      }
      return () => {
        io.disconnect()
        document.documentElement.classList.remove('home-snap-scroll')
      }
    }

    const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
    const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const rect = track.getBoundingClientRect()
        const distance = Math.max(1, track.offsetHeight - window.innerHeight)
        const p = clamp01(-rect.top / distance)

        // 0.00–0.46  giant COM's shrinks 2.4x -> 1x and lifts slightly
        const shrink = easeOut(seg(p, 0, 0.46))
        track.style.setProperty('--hero-scale', lerp(2.4, 1, shrink).toFixed(3))
        track.style.setProperty('--word-ty', `${lerp(0, -14, shrink).toFixed(1)}px`)
        // 0.38–0.58  giant word fades out as the content title takes over
        track.style.setProperty('--word-o', (1 - easeOut(seg(p, 0.38, 0.58))).toFixed(3))
        // 0.44–0.70  content block (logo + title) crossfades + rises in
        track.style.setProperty('--content-p', easeOut(seg(p, 0.44, 0.7)).toFixed(3))
        track.style.setProperty('--logo-p', easeOut(seg(p, 0.5, 0.72)).toFixed(3))
        // 0.58–0.70  PAUSE: scene stays pinned, nothing moves (Apple-style stop)
        // 0.70–0.86  taglines rise in
        track.style.setProperty('--tag-p', easeOut(seg(p, 0.7, 0.86)).toFixed(3))
        // 0.82–1.00  CTAs, notice, pills, metrics cascade in
        track.style.setProperty('--cta-p', easeOut(seg(p, 0.82, 1)).toFixed(3))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      document.documentElement.classList.remove('home-snap-scroll')
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const openPanel = (id) => {
    const map = { about: aboutRef, activities: activitiesRef, projects: projectsRef, recruit: recruitRef }
    const ref = map[id]
    if (ref && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const navHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--apple-nav-height')) || 44
      const targetY = Math.max(0, window.scrollY + rect.top - navHeight - 10)
      window.scrollTo({ top: targetY, behavior: 'smooth' })
    }
  }

  const goNotices = () => navigate('/notices')
  const goPageTop = (to, options?: any) => {
    scrollToTopInstant()
    navigate(to, options)
  }
  const goRecruitPage = () => goPageTop('/recruit')
  const locationPath = () => `${location.pathname}${location.search}${location.hash}`

  const renderSectionContent = (id) => {
    const story = sectionStories[id]
    if (story) {
      const metrics = sectionMetrics[id]
      const detailItems = id === 'activities'
        ? activityDetails.slice(0, 2)
        : id === 'projects'
          ? projectDetails.slice(0, 3)
          : []

      const primaryAction = () => {
        if (id === 'about') goPageTop('/about')
        if (id === 'activities') goPageTop('/activities')
        if (id === 'projects') goPageTop('/projects')
        if (id === 'recruit') goRecruitPage()
      }

      const secondaryAction = () => {
        if (id === 'about') openPanel('activities')
        if (id === 'activities') goPageTop('/projects')
        if (id === 'recruit') goPageTop('/recruit-notice', { state: { from: `${locationPath()}#recruit` } })
      }

      return (
        <div className="mx-auto w-full max-w-5xl">
          <div className="mx-auto max-w-4xl text-center">
            <p data-reveal className="apple-eyebrow">{sectionMeta[id].eyebrow}</p>
            <h2 data-reveal style={{ '--reveal-delay': '80ms' } as any} className="apple-display mt-4 text-5xl sm:text-6xl lg:text-7xl">{story.title}</h2>
            <p data-reveal style={{ '--reveal-delay': '160ms' } as any} className="apple-copy mx-auto mt-6 max-w-3xl text-xl sm:text-2xl">{story.body}</p>
            <div data-reveal style={{ '--reveal-delay': '240ms' } as any} className="mt-8 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={primaryAction} className={solidActionBtnClass}>
                {story.primary}
              </button>
              {id === 'projects' ? (
                <a href="https://github.com/kw-coms" target="_blank" rel="noreferrer" className={ghostActionBtnClass}>{story.secondary}</a>
              ) : (
                <button type="button" onClick={secondaryAction} className={ghostActionBtnClass}>{story.secondary}</button>
              )}
            </div>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            {metrics.map((item, index) => (
              <div key={item.value} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as any} className="apple-soft-panel px-4 py-5 text-center">
                <p className="text-lg font-semibold text-[var(--app-text)]">{item.value}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-muted)]">{item.label}</p>
              </div>
            ))}
          </div>

          {id === 'about' && (
            <div className="mt-10 grid gap-3 lg:grid-cols-3">
              {showcaseItems.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => openPanel(item.target)}
                  data-reveal
                  style={{ '--reveal-delay': `${index * 90}ms` } as any}
                  className="apple-product-panel group min-h-48 px-6 py-6 text-left transition hover:-translate-y-0.5"
                >
                  <p className="apple-eyebrow">{item.eyebrow}</p>
                  <h3 className="mt-3 text-2xl font-semibold leading-tight text-[var(--app-text)]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-6 text-[var(--app-muted)]">{item.body}</p>
                </button>
              ))}
            </div>
          )}

          {detailItems.length > 0 && (
            <div className={`mt-10 grid gap-3 ${id === 'projects' ? 'lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {detailItems.map((item, index) => (
                <article key={item.title} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as any} className="apple-product-panel px-6 py-6 text-left transition hover:-translate-y-0.5">
                  <div className="mb-5 inline-flex size-9 items-center justify-center rounded-full bg-[var(--app-surface-soft)] text-xs font-bold text-[var(--app-accent-text)]">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h3 className="text-xl font-semibold text-[var(--app-text)]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-[var(--app-muted)]">{item.description}</p>
                </article>
              ))}
            </div>
          )}

        </div>
      )
    }
    return null
  }

  const renderSectionPanel = (id) => {
    const meta = sectionMeta[id]
    const visual = visualDetails[id]
    return (
      <div data-panel="true" className={`w-full overflow-hidden ${id === 'about' || id === 'projects' ? 'apple-section-band' : 'apple-section-band-muted'}`} style={{ background: meta.background }}>
        <div className="apple-section-grid mx-auto grid min-h-[calc(100svh-44px)] max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.75fr)] lg:px-10">
          <div className="flex items-center">
            {renderSectionContent(id)}
          </div>
          <div data-reveal data-reveal-dir="right" style={{ '--reveal-delay': '120ms' } as any} className="flex items-center justify-center">
            <div className="home-device apple-device-card relative aspect-square w-full max-w-md overflow-hidden rounded-lg ring-1 ring-black/5" style={{ background: meta.visual }}>
              <div className="absolute inset-0 bg-linear-to-b from-white/30 via-transparent to-black/5" />
              <div className="absolute inset-x-6 top-6 rounded-lg bg-white/78 px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
                  <span className="size-2.5 rounded-full bg-[var(--app-accent)]" />
                </div>
                <p className="text-2xl font-semibold text-[var(--app-text)]">{visual.title}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--app-muted)]">{visual.subtitle}</p>
              </div>
              <div className="absolute left-1/2 top-1/2 flex size-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2rem] bg-white/72 shadow-[0_24px_70px_rgba(0,0,0,0.12)] backdrop-blur-md sm:size-40">
                <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="home-logo-float w-[68%] object-contain" />
              </div>
              <div className="absolute bottom-6 left-6 right-6 space-y-2">
                {visual.rows.map((row, index) => (
                  <div key={row} className="flex items-center gap-3 rounded-lg bg-white/76 px-4 py-3 text-sm font-semibold text-[var(--app-text)] shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: visual.accent }} />
                    <span>{row}</span>
                    <span className="ml-auto text-xs text-[var(--app-subtle)]">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">

      <main className="apple-home-main relative overflow-x-clip">
        <section className="coms-cinema coms-3d-stage" aria-label="COM's">
          <div ref={trackRef} className="coms-cinema-track">
            <div className="coms-cinema-pin">
              <div className="home-hero-surface absolute inset-0" />
              <div className="coms-cinema-fade absolute inset-x-0 bottom-0 h-1/3" />

              {/* Giant logo + wordmark — huge at first, shrink + fade as you scroll */}
              <div className="coms-cinema-intro" aria-hidden="true">
                <span className="coms-cinema-logowrap">
                  <img src={getLogoAsset('COMs_logo_vec')} alt="" className="coms-cinema-intrologo" />
                </span>
                <h2 className="apple-display coms-3d-title coms-cinema-word">COM&apos;s</h2>
              </div>

              {/* The rest of the hero crossfades in as the wordmark settles */}
              <div
                ref={heroInnerRef}
                className="coms-cinema-content relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center"
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const px = (e.clientX - r.left) / r.width - 0.5
                  const py = (e.clientY - r.top) / r.height - 0.5
                  e.currentTarget.style.setProperty('--coms-ry', `${px * 10}deg`)
                  e.currentTarget.style.setProperty('--coms-rx', `${-py * 8}deg`)
                }}
                onPointerLeave={(e) => {
                  e.currentTarget.style.setProperty('--coms-ry', '0deg')
                  e.currentTarget.style.setProperty('--coms-rx', '0deg')
                }}
              >
                <div className="coms-cinema-logo coms-depth-lg relative flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
                  <div className="coms-3d-card absolute inset-0 rounded-[1.5rem] bg-white/82 ring-1 ring-black/5" />
                  <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="coms-logo-3d relative z-10 h-14 w-14 object-contain sm:h-16 sm:w-16" />
                </div>
                <h2 className="apple-display coms-3d-title coms-cinema-title mt-4 whitespace-nowrap text-6xl sm:text-7xl">COM&apos;s</h2>
                <div className="coms-cinema-badge coms-depth-sm mt-4 inline-flex items-center gap-2 rounded-full bg-white/64 px-3 py-1.5 text-xs font-semibold text-[var(--app-muted)] shadow-[0_4px_16px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                  <span className="size-2 rounded-full bg-[var(--app-accent)]" />
                  2026 Semester Ready
                </div>
                <p className="coms-cinema-tag coms-depth-sm mt-4 text-sm font-semibold text-[var(--app-muted)]">Kwangwoon University Computer Club</p>
                <p className="coms-cinema-tag apple-copy mx-auto mt-3 max-w-[20rem] text-lg sm:max-w-3xl sm:text-2xl">
                  배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.
                </p>
                <div className="coms-cinema-cta mt-6 flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={() => openPanel('about')} className={solidActionBtnClass}>더 알아보기</button>
                  <button type="button" onClick={goRecruitPage} className={ghostActionBtnClass}>지원하기</button>
                </div>
                {latestNotice && (
                  <button type="button" onClick={goNotices} className="coms-cinema-cta mx-auto mt-6 flex max-w-md items-center gap-2 rounded-full bg-[var(--app-surface)] px-4 py-2 text-left shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition hover:shadow-[0_5px_18px_rgba(0,0,0,0.12)]">
                    <Megaphone size={14} className="shrink-0 text-[var(--app-accent-text)]" />
                    <span className="truncate text-xs font-semibold text-[var(--app-text)]">{latestNotice.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-bold uppercase text-[var(--app-accent-text)]">공지</span>
                  </button>
                )}
                <div className="coms-cinema-cta mx-auto mt-5 flex max-w-[21rem] flex-wrap justify-center gap-2 sm:max-w-3xl">
                  {experiencePills.map((pill) => (
                    <span key={pill} className="rounded-full bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--app-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:px-3 sm:text-xs">
                      {pill}
                    </span>
                  ))}
                </div>
                <div className="coms-cinema-cta apple-hero-metrics mx-auto mt-7 hidden max-w-3xl grid-cols-3 sm:grid">
                  {heroHighlights.map((item) => (
                    <div key={item.value} className="px-5 text-center">
                      <p className="text-[11px] font-semibold text-[var(--app-subtle)]">{item.label}</p>
                      <p className="mt-1 text-base font-semibold text-[var(--app-text)]">{item.value}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="coms-cinema-hint" aria-hidden="true">
                <ChevronDown size={22} />
              </div>
            </div>
          </div>
        </section>

        <section className="apple-showcase-strip bg-[var(--app-surface)] px-5 py-4 sm:py-6">
          <div className="coms-hscroll mx-auto max-w-7xl">
            {showcaseItems.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => openPanel(item.target)}
                data-reveal
                style={{ '--reveal-delay': `${index * 90}ms` } as any}
                className="coms-hslide apple-product-panel apple-showcase-card group flex min-h-[12rem] flex-col px-6 py-6 text-left text-[var(--app-text)] transition hover:-translate-y-0.5"
              >
                <p className="text-sm font-semibold text-[var(--app-accent-text)]">{item.eyebrow}</p>
                <h3 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-[var(--app-text)]">{item.title}</h3>
                <p className="mt-4 max-w-sm leading-7 text-[var(--app-muted)]">{item.body}</p>
                <span className="apple-action-primary mt-8 inline-flex w-fit items-center gap-1 px-4 py-2 text-sm">
                  더 보기
                  <ChevronDown size={14} className="-rotate-90 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="border-y border-[var(--app-hairline)] bg-[var(--app-surface)] py-3 sm:py-4" aria-hidden="true">
          <div className="coms-marquee">
            <div className="coms-marquee-track">
              {[...experiencePills, ...experiencePills, ...experiencePills, ...experiencePills].map((pill, index) => (
                <span key={index} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--app-muted)]">
                  <span className="size-1.5 rounded-full bg-[var(--app-accent)]" />
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--app-surface-soft)] px-5 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div data-reveal>
                <p className="apple-eyebrow">Member loop</p>
                <h2 className="apple-display mt-3 text-4xl sm:text-5xl">활동 허브</h2>
                <p className="apple-copy mt-3 max-w-2xl text-lg">
                  공지, 커뮤니티, 자료실을 한 번에 이어서 부원이 다시 들어올 이유를 분명하게 만듭니다.
                </p>
              </div>
              <button type="button" onClick={() => goPageTop('/notices')} className={ghostActionBtnClass}>최근 공지 보기</button>
            </div>
            <div className="coms-hscroll mt-8">
              {activityHubItems.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => goPageTop(item.route)}
                  data-reveal
                  style={{ '--reveal-delay': `${index * 90}ms` } as any}
                  className="coms-hslide apple-product-panel min-h-44 px-6 py-6 text-left transition hover:-translate-y-0.5"
                >
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--app-accent-soft)] text-sm font-bold text-[var(--app-accent-text)]">
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-2xl font-semibold text-[var(--app-text)]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-6 text-[var(--app-muted)]">{item.body}</p>
                  <span className="mt-5 inline-flex text-sm font-bold text-[var(--app-accent-text)]">{item.cta}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <ClubCalendarSection compact />

        <section ref={aboutRef} id="about" className="home-snap-section relative">
          {renderSectionPanel('about')}
        </section>
        <section ref={activitiesRef} id="activities" className="home-snap-section relative">
          {renderSectionPanel('activities')}
        </section>
        <section ref={projectsRef} id="projects" className="home-snap-section relative">
          {renderSectionPanel('projects')}
        </section>
        <section ref={recruitRef} id="recruit" className="home-snap-section relative">
          {renderSectionPanel('recruit')}
        </section>
      </main>
    </div>
  )
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function PageShell({ children, wide = false, full = false, transition = true }: any) {
  return (
    <div className="apple-route relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white via-[#f5f5f7] to-white" />
      <main className={`apple-page-shell-main ${full ? 'apple-page-shell-main-full' : ''} relative mx-auto flex min-h-screen min-w-0 px-4 sm:px-6 ${full ? 'items-start pt-20 pb-16' : 'items-center justify-center py-24'} ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>
        <div className={`${transition ? 'page-transition' : ''} w-full min-w-0 ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>{children}</div>
      </main>
    </div>
  )
}

export default App
