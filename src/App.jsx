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
  Download,
  Grid3x3,
  LogOut,
  Menu,
  Megaphone,
  Moon,
  Repeat,
  Sparkles,
  Sun,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { listNotices } from './services/noticeApi.js'
import {
  createClubActivity,
  deleteClubActivity,
  listClubActivities,
  getClubActivity,
  updateClubActivity,
  uploadClubActivityFile,
  uploadClubActivityImages,
  voteClubActivity,
  listClubActivityCategories,
  listScheduleOccurrences,
  listRecurringSchedules,
  createRecurringSchedule,
  updateRecurringSchedule,
  deleteRecurringSchedule,
  upsertRecurringScheduleException,
  deleteRecurringScheduleException,
} from './services/clubActivityApi.js'
import {
  createClubEvent,
  deleteClubEvent,
  deleteClubEventEntry,
  getClubEvent,
  listClubEvents,
  uploadClubEventEntry,
  voteClubEventEntry,
} from './services/clubEventApi.js'
import { getNotificationSummary, listNotifications, markAllNotificationsRead, markNotificationRead } from './services/notificationApi.js'
import { listFonts } from './services/fontApi.js'
import { BUILT_IN_FONTS, buildFontFaceCss, fontFamilyValue, injectBuiltinFontStylesheets } from './services/fontPreferences.js'
const Archive = lazy(() => import('./pages/Archive.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Signup = lazy(() => import('./pages/Signup.jsx'))
const Notices = lazy(() => import('./pages/Notices.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const Community = lazy(() => import('./pages/Community.jsx'))
const ChangePassword = lazy(() => import('./pages/ChangePassword.jsx'))
const RecruitApply = lazy(() => import('./pages/RecruitApply.jsx'))
const RecruitNotice = lazy(() => import('./pages/RecruitNotice.jsx'))
import { getLogoAsset } from './utils/logoAssets.js'
import { buildCalendarDayEvents, buildMonthEventSummary, visibleDayEvents } from './utils/monthlyCalendar.js'
import { parseScheduleCsv } from './utils/scheduleCsv.js'
import { useAuth } from './contexts/useAuth.js'
import { ActivityCategory } from './contract/enums.js'
import { enumLabels } from './contract/labels.js'
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
  calendarWeekdays,
  calendarMonthOptions,
  clubActivityCategories,
  projectsDetailCards,
  projectsDetailFlow,
  projectsDetailOutputs,
  accentSwatches,
  footerLinkGroups,
  navExtraItems,
  activitySectionNavItems,
} from './data/homeContent.js'
import PageFallback from './components/home/PageFallback.jsx'
import CompanionServicesSection from './components/home/CompanionServicesSection.jsx'

const NOTIFICATIONS_QUERY_KEY = ['app-shell', 'notifications']
const CLUB_ACTIVITIES_QUERY_KEY = ['app-shell', 'club-activities']
const CLUB_EVENTS_QUERY_KEY = ['app-shell', 'club-events']
const CLUB_ACTIVITY_CATEGORIES_QUERY_KEY = ['app-shell', 'club-activity-categories']
const SCHEDULE_OCCURRENCES_QUERY_KEY = ['app-shell', 'schedule-occurrences']
const RECURRING_SCHEDULES_QUERY_KEY = ['app-shell', 'recurring-schedules']
const WEEKDAY_OPTIONS = [
  { value: 'MONDAY', label: '월' },
  { value: 'TUESDAY', label: '화' },
  { value: 'WEDNESDAY', label: '수' },
  { value: 'THURSDAY', label: '목' },
  { value: 'FRIDAY', label: '금' },
  { value: 'SATURDAY', label: '토' },
  { value: 'SUNDAY', label: '일' },
]
const WEEKDAY_SHORT = {
  MONDAY: '월', TUESDAY: '화', WEDNESDAY: '수', THURSDAY: '목',
  FRIDAY: '금', SATURDAY: '토', SUNDAY: '일',
}
const SCHEDULE_COLOR_OPTIONS = ['#0071e3', '#34c759', '#ff9f0a', '#8e5cf7', '#ff3b30', '#00a7c7']
const DEFAULT_SCHEDULE_COLOR = SCHEDULE_COLOR_OPTIONS[0]
const FONTS_QUERY_KEY = ['app-shell', 'fonts']
const LATEST_NOTICE_QUERY_KEY = ['app-shell', 'latest-notice']

const floatingBarBaseClass = 'apple-topbar border-b border-[var(--app-hairline)]'
const solidActionBtnClass = 'apple-action-primary inline-flex min-h-10 items-center justify-center px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60'
const ghostActionBtnClass = 'apple-action-secondary inline-flex min-h-10 items-center justify-center px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60'
const DETAIL_TITLE_MIN_FIT = 0.74

function buildCalendarMonth(referenceDate = new Date()) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = (firstDay.getDay() + 6) % 7
  const trailingBlanks = (7 - ((leadingBlanks + daysInMonth) % 7)) % 7
  return {
    title: `${year}년 ${month + 1}월`,
    year,
    month,
    days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    leadingBlanks,
    trailingBlanks,
  }
}

function parseLocalDate(value) {
  if (typeof value !== 'string') return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatActivityDate(value) {
  const date = parseLocalDate(value)
  if (!date) return value || ''
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

// Categories are admin-managed (DB-backed). Prefer the server-provided display
// name; fall back to the legacy hardcoded labels for any cached/older payloads.
// Keys bound to the canonical ClubActivity.Category enum (drift-guarded).
const ACTIVITY_CATEGORY_LABELS = enumLabels(ActivityCategory, {
  [ActivityCategory.GENERAL]: '일반',
  [ActivityCategory.SEMINAR]: '세미나',
  [ActivityCategory.STUDY]: '스터디',
  [ActivityCategory.PROJECT]: '프로젝트',
  [ActivityCategory.MEETING]: '회의',
  [ActivityCategory.RECRUIT]: '모집',
  [ActivityCategory.EVENT]: '행사',
  [ActivityCategory.MT]: 'MT',
  [ActivityCategory.ACHIEVEMENT]: '성과',
})

function categoryLabel(value, fallbackName) {
  if (fallbackName) return fallbackName
  return ACTIVITY_CATEGORY_LABELS[value] || value || '일반'
}

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

function rgbToHex({ r, g, b }) {
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

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center text-[var(--app-muted)] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        로그인 상태를 확인하는 중...
      </div>
    </PageShell>
  )
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center text-[var(--app-muted)] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        로그인 상태를 확인하는 중...
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
  const activityWrapperRef = useRef(null)
  const activeKey = getActiveNavKey(location.pathname)
  const mobileTabs = tabs.slice(0, 3)
  const showMobileTabs = mobileTabs.some((tab) => tab.id === activeKey)
  const primaryNavItems = tabs.map((tab) => ({ ...tab, path: getTabRoute(tab.id) }))
  const noticesNavItem = navExtraItems.find((item) => item.id === 'notices')
  const memberNavItems = navExtraItems.filter((item) => item.id !== 'notices')
  const activityNavActive = activitySectionNavItems.some((item) => item.id === activeKey)

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

  const goPageTop = (to, options) => {
    scrollToTopInstant()
    navigate(to, options)
  }

  const closeAndGo = (to, options) => {
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
    <header className="apple-global-nav fixed inset-x-0 top-0 z-[80]">
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
              className={`${navClass(item.id)} disabled:cursor-wait disabled:opacity-60`}
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
            {primaryNavItems.map((item) => (
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
                    className="flex w-full items-start gap-3 px-6 py-3 text-left transition hover:bg-black/[0.03]"
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
  )
}

const EMPTY_NOTIFICATIONS = { items: [], unreadCount: 0 }

function NotificationButton({ alignLeft = false, variant = 'icon' }) {
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
      queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, (prev) => {
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
    queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, (prev) => {
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
}) {
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
function App() {
  const { user } = useAuth()
  const navigate = useNavigate()
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
      <ScrollToTop />
      <GlobalNavigation />
      <Routes>
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
        <Route path="/community/:id" element={<RequireAuth><CommunityPage /></RequireAuth>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/recruit" element={<RecruitPage />} />
        <Route path="/recruit-notice" element={<RecruitNoticePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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

// Shared loader for the two club-activity surfaces (activity log + calendar).
// Both read the full list and prepend optimistically after a create, so they
// share one cache entry — a create in one view refreshes the other for free.
function useClubActivities(loadErrorMessage) {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CLUB_ACTIVITIES_QUERY_KEY,
    queryFn: async () => {
      const data = await listClubActivities()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })

  const records = query.data ?? null
  const loading = Boolean(user && records === null && !query.error)
  const loadError = query.error ? (query.error.message || loadErrorMessage) : ''

  const prependActivity = (created) => {
    queryClient.setQueryData(CLUB_ACTIVITIES_QUERY_KEY, (prev) => [created, ...(Array.isArray(prev) ? prev : [])])
  }

  const mergeActivity = (updated) => {
    queryClient.setQueryData(CLUB_ACTIVITIES_QUERY_KEY, (prev) =>
      (Array.isArray(prev) ? prev : []).map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    )
  }

  const removeActivity = (id) => {
    queryClient.setQueryData(CLUB_ACTIVITIES_QUERY_KEY, (prev) =>
      (Array.isArray(prev) ? prev : []).filter((item) => item.id !== id),
    )
  }

  return { user, authLoading, records, loading, loadError, prependActivity, mergeActivity, removeActivity }
}

// Admin-managed club-activity categories. Falls back to the static list so the
// dropdowns still render if the categories endpoint is unavailable.
function useClubActivityCategories() {
  const { user, loading: authLoading } = useAuth()
  const query = useQuery({
    queryKey: CLUB_ACTIVITY_CATEGORIES_QUERY_KEY,
    queryFn: async () => {
      const data = await listClubActivityCategories()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })
  const categories = query.data && query.data.length > 0
    ? query.data
    : clubActivityCategories.map(([key, name], position) => ({ key, name, position }))
  return categories
}

// Expanded recurring-schedule occurrences for the visible month (year/month).
function useScheduleOccurrences(year, month) {
  const { user, loading: authLoading } = useAuth()
  const query = useQuery({
    queryKey: [...SCHEDULE_OCCURRENCES_QUERY_KEY, year, month],
    queryFn: async () => {
      const data = await listScheduleOccurrences(year, month + 1)
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })
  return query.data ?? []
}

function ActivityLogSection({ compact = false }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, authLoading, records, loading, loadError, prependActivity, mergeActivity, removeActivity } = useClubActivities('활동 기록을 불러오지 못했습니다.')
  const categories = useClubActivityCategories()
  const [votingId, setVotingId] = useState(null)
  const [viewedIds] = useState(() => new Set())
  const [submitError, setSubmitError] = useState('')
  const error = submitError || loadError
  const [activityMode, setActivityMode] = useState('list')
  const [activityForm, setActivityForm] = useState({
    title: '',
    eventDate: '',
    category: '',
    description: '',
  })
  const [activityImages, setActivityImages] = useState([])
  const [activityFiles, setActivityFiles] = useState([])
  const [savingActivity, setSavingActivity] = useState(false)
  const [activityNotice, setActivityNotice] = useState('')
  const [selectedActivityId, setSelectedActivityId] = useState(null)
  const [activityEditor, setActivityEditor] = useState(null)
  const [editImages, setEditImages] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingActivity, setDeletingActivity] = useState(false)
  // Search + filter state (mirrors notices/resources/community list patterns).
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Default the composer category to the first admin-managed category without
  // a state-syncing effect (the dropdown is controlled by this derived value).
  const selectedCategory = activityForm.category || categories[0]?.key || ''

  const allActivityItems = (user ? records || [] : []).filter((item) => item.kind === 'ACTIVITY')
  const normalizedSearch = searchText.trim().toLowerCase()
  const filteredItems = allActivityItems.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false
    if (fromDate && (item.eventDate || '') < fromDate) return false
    if (toDate && (item.eventDate || '') > toDate) return false
    if (normalizedSearch) {
      const haystack = `${item.title || ''} ${item.description || ''} ${item.createdByName || ''}`.toLowerCase()
      if (!haystack.includes(normalizedSearch)) return false
    }
    return true
  })
  const visibleItems = compact ? filteredItems.slice(0, 3) : filteredItems
  const selectedActivity = allActivityItems.find((item) => item.id === selectedActivityId) || null
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'
  const hasActiveFilters = Boolean(normalizedSearch) || categoryFilter !== 'ALL' || Boolean(fromDate) || Boolean(toDate)
  const selectedEditorCategory = activityEditor?.category || categories[0]?.key || ''

  const activityImagesFor = (item) => {
    const infos = Array.isArray(item?.imageInfos) ? item.imageInfos.filter((image) => image?.url) : []
    if (infos.length > 0) return infos
    if (item?.imageUrl) {
      return [{
        id: `${item.id}-legacy-image`,
        url: item.imageUrl,
        originalName: item.imageOriginalName || '활동 사진',
      }]
    }
    return []
  }

  const submitActivity = async (event) => {
    event.preventDefault()
    if (!activityForm.title.trim() || !activityForm.eventDate) return
    const form = event.currentTarget
    setSavingActivity(true)
    setActivityNotice('')
    setSubmitError('')
    try {
      const created = await createClubActivity({
        kind: 'ACTIVITY',
        category: selectedCategory,
        title: activityForm.title.trim(),
        description: activityForm.description.trim(),
        eventDate: activityForm.eventDate,
      })
      prependActivity(created)
      if (activityImages.length > 0) {
        await uploadClubActivityImages(created.id, activityImages)
      }
      if (activityFiles.length > 0) {
        for (const file of activityFiles) {
          await uploadClubActivityFile(created.id, file)
        }
      }
      if (activityImages.length > 0 || activityFiles.length > 0) {
        await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITIES_QUERY_KEY })
      }
      setActivityNotice('활동 글을 등록했습니다.')
      setActivityForm((prev) => ({ ...prev, title: '', eventDate: '', description: '' }))
      setActivityImages([])
      setActivityFiles([])
      setActivityMode('list')
      form.reset()
    } catch (err) {
      setSubmitError(err.message || '활동 기록을 추가하지 못했습니다.')
    } finally {
      setSavingActivity(false)
    }
  }

  // Register a view once per activity per mount when the card is opened.
  const registerActivityView = async (item) => {
    if (!user || viewedIds.has(item.id)) return
    viewedIds.add(item.id)
    try {
      const detail = await getClubActivity(item.id)
      mergeActivity(detail)
    } catch {
      viewedIds.delete(item.id)
    }
  }

  const openActivityDetail = (item) => {
    setSelectedActivityId(item.id)
    setActivityEditor(null)
    setEditImages([])
    setSubmitError('')
    registerActivityView(item)
  }

  const closeActivityDetail = () => {
    setSelectedActivityId(null)
    setActivityEditor(null)
    setEditImages([])
    setSavingEdit(false)
    setDeletingActivity(false)
  }

  const startActivityEdit = () => {
    if (!selectedActivity) return
    setActivityEditor({
      title: selectedActivity.title || '',
      eventDate: selectedActivity.eventDate || '',
      category: selectedActivity.category || categories[0]?.key || '',
      description: selectedActivity.description || '',
    })
    setEditImages([])
    setSubmitError('')
  }

  const saveActivityEdit = async (event) => {
    event.preventDefault()
    if (!selectedActivity || !activityEditor?.title.trim() || !activityEditor.eventDate) return
    setSavingEdit(true)
    setSubmitError('')
    try {
      const updated = await updateClubActivity(selectedActivity.id, {
        kind: 'ACTIVITY',
        category: selectedEditorCategory,
        title: activityEditor.title.trim(),
        description: activityEditor.description.trim(),
        eventDate: activityEditor.eventDate,
      })
      mergeActivity(updated)
      if (editImages.length > 0) {
        await uploadClubActivityImages(selectedActivity.id, editImages)
        await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITIES_QUERY_KEY })
      }
      setActivityEditor(null)
      setEditImages([])
      setActivityNotice('활동 기록을 수정했습니다.')
    } catch (err) {
      setSubmitError(err.message || '활동 기록을 수정하지 못했습니다.')
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteSelectedActivity = async () => {
    if (!selectedActivity || deletingActivity) return
    if (!window.confirm('이 활동 기록을 삭제할까요?')) return
    setDeletingActivity(true)
    setSubmitError('')
    try {
      await deleteClubActivity(selectedActivity.id)
      removeActivity(selectedActivity.id)
      closeActivityDetail()
      setActivityNotice('활동 기록을 삭제했습니다.')
    } catch (err) {
      setSubmitError(err.message || '활동 기록을 삭제하지 못했습니다.')
    } finally {
      setDeletingActivity(false)
    }
  }

  const handleActivityVote = async (item) => {
    if (!user || votingId) return
    setVotingId(item.id)
    try {
      const updated = await voteClubActivity(item.id, item.myVote === 1 ? 0 : 1)
      mergeActivity(updated)
    } catch (err) {
      setSubmitError(err.message || '추천 중 오류가 발생했습니다.')
    } finally {
      setVotingId(null)
    }
  }

  return (
    <>
      <section id="activity-log" className={`activity-proof-section ${compact ? 'activity-proof-section-compact' : ''} scroll-mt-24 bg-[var(--app-surface)] px-5 py-12 sm:py-16`}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.62fr_1fr] lg:items-end">
            <div>
              <p className="apple-eyebrow">Activity log</p>
              <h2 className="apple-display mt-3 text-4xl sm:text-5xl">실제로 이어지는 활동 기록</h2>
              <p className="apple-copy mt-4 max-w-2xl text-lg">
                신입생이 가장 먼저 궁금해하는 것은 지금도 활동이 이어지는지입니다. 검증된 활동 사진과 기록이 등록되면 날짜, 활동명, 후기 흐름으로 보여줍니다.
              </p>
            </div>
            <div className="activity-proof-note apple-soft-panel px-5 py-5">
              <p className="text-sm font-semibold text-[var(--app-text)]">기록 방식</p>
              <p className="mt-2 text-sm font-medium leading-6 text-[var(--app-muted)]">
                세미나, 스터디, 프로젝트 발표, MT/행사, 수상/성과처럼 실제 확인된 항목만 활동 로그에 노출합니다.
              </p>
            </div>
          </div>

          {!compact && isAdmin && !isLocked && activityMode === 'list' && (
            <div className="activity-community-toolbar mt-8">
              <div>
                <p className="activity-community-board-label">Activity board</p>
                <p>활동 기록을 커뮤니티 글처럼 작성하고 목록에서 바로 열람합니다.</p>
              </div>
              <button type="button" onClick={() => { setActivityMode('write'); setSubmitError(''); setActivityNotice('') }} className="apple-action-primary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm">
                글쓰기
              </button>
            </div>
          )}

          {!compact && activityMode === 'write' && (
            <form onSubmit={submitActivity} className="activity-community-compose community-compose-form mt-8 grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start" aria-label="활동 글쓰기">
              <div className="community-compose-meta order-2 flex flex-wrap gap-2 lg:col-start-2 lg:row-start-1">
                <label className="activity-community-side-field">
                  <span>분류</span>
                  <select
                    aria-label="분류"
                    value={selectedCategory}
                    onChange={(event) => setActivityForm((prev) => ({ ...prev, category: event.target.value }))}
                  >
                    {categories.map((category) => (
                      <option key={category.key} value={category.key}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="activity-community-side-field">
                  <span>활동 날짜</span>
                  <input
                    aria-label="활동 날짜"
                    type="date"
                    value={activityForm.eventDate}
                    onChange={(event) => setActivityForm((prev) => ({ ...prev, eventDate: event.target.value }))}
                  />
                </label>
              </div>

              <input
                aria-label="제목"
                value={activityForm.title}
                onChange={(event) => setActivityForm((prev) => ({ ...prev, title: event.target.value }))}
                maxLength={120}
                placeholder="제목"
                className="community-compose-title order-1 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm lg:col-start-1 lg:row-start-1"
              />

              <div className="community-compose-editor order-4 overflow-hidden rounded border border-black/15 bg-[var(--app-surface)] lg:col-start-1 lg:row-start-2 lg:row-span-5">
                <div className="community-editor-toolbar flex flex-wrap items-center gap-2 border-b border-[var(--app-hairline)] bg-black/[0.03] px-3 py-2">
                  <span className="mr-1 text-xs font-black uppercase text-[var(--theme-body-muted)]">Editor</span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
                    이미지
                    <input
                      aria-label="이미지"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => setActivityImages(Array.from(event.target.files || []))}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
                    첨부파일
                    <input
                      aria-label="첨부파일"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => setActivityFiles(Array.from(event.target.files || []))}
                    />
                  </label>
                  <span className="text-xs text-[var(--theme-body-muted)]">
                    이미지 {activityImages.length}개 · 첨부 {activityFiles.length}개
                  </span>
                </div>
                <textarea
                  aria-label="본문"
                  value={activityForm.description}
                  onChange={(event) => setActivityForm((prev) => ({ ...prev, description: event.target.value }))}
                  maxLength={5000}
                  rows={14}
                  placeholder="본문을 입력하세요."
                  className="min-h-[22rem] w-full resize-y bg-[var(--app-surface)] px-4 py-4 text-base leading-8 text-[var(--app-text)] outline-none"
                />
              </div>

              {submitError && <p className="community-compose-error order-5 text-sm font-semibold text-red-500 lg:col-start-2">{submitError}</p>}

              <div className="community-compose-actions order-6 flex flex-col gap-2 sm:flex-row lg:col-start-2 lg:flex-col">
                <button type="submit" disabled={savingActivity || !activityForm.title.trim() || !activityForm.eventDate} className="apple-action-primary min-h-11 px-5 py-2.5 text-sm disabled:opacity-50">
                  {savingActivity ? '저장 중...' : '글 등록'}
                </button>
                <button type="button" disabled={savingActivity} onClick={() => setActivityMode('list')} className="apple-action-secondary min-h-11 px-5 py-2.5 text-sm">
                  취소
                </button>
              </div>
            </form>
          )}

          {activityMode === 'list' && activityNotice && (
            <div className="activity-community-notice mt-4" role="status">{activityNotice}</div>
          )}

          {activityMode === 'list' && !compact && !isLocked && !authLoading && !loading && !loadError && (
            <div className="activity-log-filters mt-8 flex flex-wrap items-end gap-3">
              <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
                <span>검색</span>
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="제목, 내용, 작성자로 검색"
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
                <span>분류</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
                >
                  <option value="ALL">전체 분류</option>
                  {categories.map((category) => (
                    <option key={category.key} value={category.key}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
                <span>시작일</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
                <span>종료일</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
                />
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setSearchText(''); setCategoryFilter('ALL'); setFromDate(''); setToDate('') }}
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--app-accent-text)] transition hover:bg-[var(--app-surface-soft)]"
                >
                  필터 초기화
                </button>
              )}
            </div>
          )}

          {activityMode === 'list' && (authLoading || loading ? (
            <div className="activity-empty-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>활동 기록을 불러오는 중...</h3>
                <p>회원 상태와 등록된 활동 기록을 확인하고 있습니다.</p>
              </div>
            </div>
          ) : isLocked ? (
            <div className="activity-empty-state activity-locked-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>로그인 하세요</h3>
                <p>회원 로그인 후 활동 기록과 일정을 확인할 수 있습니다.</p>
                <button type="button" onClick={() => navigate('/login')} className="apple-action-primary mt-3 inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm">
                  로그인
                </button>
              </div>
            </div>
          ) : error ? (
            <div className="activity-empty-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>활동 기록을 불러오지 못했습니다.</h3>
                <p>{error}</p>
              </div>
            </div>
          ) : visibleItems.length > 0 ? (
            <div className="activity-community-list activity-log-grid mt-8">
              {visibleItems.map((item) => {
                const itemImages = activityImagesFor(item)
                const previewImage = itemImages[0]?.url || ''
                return (
                  <article key={item.id} className="activity-log-card activity-community-row">
                    <button type="button" className="activity-community-row-main" onClick={() => openActivityDetail(item)} aria-label={`${item.title} 내용 보기`}>
                      <span className="activity-community-row-index">{formatActivityDate(item.eventDate)}</span>
                      <span className="activity-community-row-content">
                        <span className="activity-community-row-meta">
                          <span>{categoryLabel(item.category, item.categoryName)}</span>
                          <span>{item.createdByName || 'COM\'s'}</span>
                          {itemImages.length > 0 && <span>사진 {itemImages.length}장</span>}
                          {(item.fileInfos?.length ?? 0) > 0 && <span>첨부 {item.fileInfos.length}개</span>}
                        </span>
                        <h3>{item.title}</h3>
                        {item.description && <span className="activity-community-row-excerpt">{item.description}</span>}
                      </span>
                      {previewImage && <img src={previewImage} alt="" className="activity-log-image activity-community-row-thumb" loading="lazy" />}
                    </button>
                    <div className="activity-community-row-stats">
                      <span>조회 {item.viewCount ?? 0}</span>
                      <span><ThumbsUp size={13} aria-hidden="true" />개추 {item.upvotes ?? 0}</span>
                      <button type="button" className="activity-log-open-button" onClick={() => openActivityDetail(item)}>
                        내용 보기
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : hasActiveFilters ? (
            <div className="activity-empty-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>검색 결과가 없습니다.</h3>
                <p>다른 검색어나 필터 조건으로 다시 시도해보세요.</p>
              </div>
            </div>
          ) : (
            <div className="activity-empty-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>등록된 활동 기록이 없습니다.</h3>
                <p>확인된 활동 사진, 후기, 성과 기록이 추가되면 이 영역에 바로 표시됩니다.</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedActivity && createPortal(
        <div className="activity-detail-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeActivityDetail()
        }}>
          <article
            className="activity-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-detail-title"
          >
            <header className="activity-detail-header">
              <div>
                <p className="activity-detail-eyebrow">
                  {categoryLabel(selectedActivity.category, selectedActivity.categoryName)} · {formatActivityDate(selectedActivity.eventDate)}
                </p>
                <h3 id="activity-detail-title">{selectedActivity.title}</h3>
                <p>{selectedActivity.createdByName || 'COM\'s'} 작성</p>
              </div>
              <button type="button" className="activity-detail-close" onClick={closeActivityDetail} aria-label="활동 기록 닫기">
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {activityEditor ? (
              <form onSubmit={saveActivityEdit} className="activity-detail-editor" aria-label="활동 기록 수정">
                <label>
                  <span>활동 제목</span>
                  <input
                    value={activityEditor.title}
                    onChange={(event) => setActivityEditor((prev) => ({ ...prev, title: event.target.value }))}
                    maxLength={120}
                  />
                </label>
                <label>
                  <span>활동 날짜</span>
                  <input
                    type="date"
                    value={activityEditor.eventDate}
                    onChange={(event) => setActivityEditor((prev) => ({ ...prev, eventDate: event.target.value }))}
                  />
                </label>
                <label>
                  <span>활동 분류</span>
                  <select
                    value={selectedEditorCategory}
                    onChange={(event) => setActivityEditor((prev) => ({ ...prev, category: event.target.value }))}
                  >
                    {categories.map((category) => (
                      <option key={category.key} value={category.key}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>사진 추가</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setEditImages(Array.from(event.target.files || []))}
                  />
                </label>
                <label className="activity-detail-editor-wide">
                  <span>활동 내용</span>
                  <textarea
                    value={activityEditor.description}
                    onChange={(event) => setActivityEditor((prev) => ({ ...prev, description: event.target.value }))}
                    maxLength={500}
                    rows={5}
                  />
                </label>
                <div className="activity-detail-editor-actions">
                  <button type="button" className="activity-detail-secondary" onClick={() => setActivityEditor(null)} disabled={savingEdit}>
                    취소
                  </button>
                  <button type="submit" disabled={savingEdit || !activityEditor.title.trim() || !activityEditor.eventDate}>
                    {savingEdit ? '저장 중...' : '수정 저장'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {activityImagesFor(selectedActivity).length > 0 && (
                  <div className="activity-detail-gallery" aria-label="활동 사진">
                    {activityImagesFor(selectedActivity).map((image, index) => (
                      <img key={image.id || image.url || index} src={image.url} alt="" loading="lazy" />
                    ))}
                  </div>
                )}
                {selectedActivity.description && (
                  <p className="activity-detail-description">{selectedActivity.description}</p>
                )}
                {(selectedActivity.fileInfos?.length ?? 0) > 0 && (
                  <ul className="activity-detail-files">
                    {selectedActivity.fileInfos.map((file) => (
                      <li key={file.id}>
                        <a href={file.url}>
                          <Download size={14} aria-hidden="true" />
                          {file.originalName || '첨부파일'}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="activity-detail-actions">
                  <span>조회 {selectedActivity.viewCount ?? 0}</span>
                  <button
                    type="button"
                    onClick={() => handleActivityVote(selectedActivity)}
                    disabled={votingId === selectedActivity.id}
                    className={selectedActivity.myVote === 1 ? 'is-active' : ''}
                  >
                    <ThumbsUp size={15} aria-hidden="true" />
                    개추 {selectedActivity.upvotes ?? 0}
                  </button>
                  {isAdmin && (
                    <div className="activity-detail-admin-actions">
                      <button type="button" onClick={startActivityEdit}>수정</button>
                      <button type="button" onClick={deleteSelectedActivity} disabled={deletingActivity}>
                        {deletingActivity ? '삭제 중...' : '삭제'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </article>
        </div>,
        document.body,
      )}
    </>
  )
}

function useClubEvents(loadErrorMessage) {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CLUB_EVENTS_QUERY_KEY,
    queryFn: async () => {
      const data = await listClubEvents()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })

  const events = query.data ?? null
  const loading = Boolean(user && events === null && !query.error)
  const loadError = query.error ? (query.error.message || loadErrorMessage) : ''

  const prependEvent = (created) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => [created, ...(Array.isArray(prev) ? prev : [])])
  }

  const mergeEvent = (updated) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => {
      const list = Array.isArray(prev) ? prev : []
      const found = list.some((item) => item.id === updated.id)
      return found ? list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) : [updated, ...list]
    })
  }

  const removeEvent = (id) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => (Array.isArray(prev) ? prev.filter((item) => item.id !== id) : []))
  }

  return { user, authLoading, events, loading, loadError, prependEvent, mergeEvent, removeEvent }
}

function toEventDateTime(value, endOfDay = false) {
  if (!value) return ''
  return `${value}T${endOfDay ? '23:59:00' : '00:00:00'}`
}

function formatEventDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatEventWindow(event) {
  const start = formatEventDateTime(event.startsAt)
  const end = formatEventDateTime(event.endsAt)
  return [start, end].filter(Boolean).join(' ~ ')
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  if (n >= 1024) return `${Math.round(n / 1024)}KB`
  return `${n}B`
}

function ClubEventSection() {
  const navigate = useNavigate()
  const { user, authLoading, events, loading, loadError, prependEvent, mergeEvent, removeEvent } = useClubEvents('이벤트를 불러오지 못했습니다.')
  const [mode, setMode] = useState('list')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [selectedSnapshot, setSelectedSnapshot] = useState(null)
  const [eventForm, setEventForm] = useState({ title: '', description: '', startsOn: '', endsOn: '' })
  const [entryForm, setEntryForm] = useState({ title: '', authorName: '', description: '' })
  const [entryFiles, setEntryFiles] = useState([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)
  const [savingEntry, setSavingEntry] = useState(false)
  const [votingEntryId, setVotingEntryId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const eventItems = user ? events || [] : []
  const selectedEvent = selectedEventId == null
    ? null
    : eventItems.find((item) => item.id === selectedEventId) || selectedSnapshot
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'
  const visibleError = error || loadError

  const resetEventForm = () => {
    setEventForm({ title: '', description: '', startsOn: '', endsOn: '' })
  }

  const resetEntryForm = () => {
    setEntryForm({ title: '', authorName: '', description: '' })
    setEntryFiles([])
  }

  const openEvent = async (item) => {
    setMode('detail')
    setSelectedEventId(item.id)
    setSelectedSnapshot(item)
    setNotice('')
    setError('')
    try {
      const detail = await getClubEvent(item.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
    } catch (err) {
      setError(err.message || '이벤트 상세를 불러오지 못했습니다.')
    }
  }

  const submitEvent = async (event) => {
    event.preventDefault()
    if (!eventForm.title.trim() || !eventForm.startsOn || !eventForm.endsOn) return
    setSavingEvent(true)
    setNotice('')
    setError('')
    try {
      const created = await createClubEvent({
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        startsAt: toEventDateTime(eventForm.startsOn),
        endsAt: toEventDateTime(eventForm.endsOn, true),
      })
      prependEvent(created)
      setSelectedEventId(created.id)
      setSelectedSnapshot(created)
      setMode('detail')
      resetEventForm()
      setNotice('이벤트를 열었습니다. 이제 회지와 작품을 업로드할 수 있습니다.')
    } catch (err) {
      setError(err.message || '이벤트를 만들지 못했습니다.')
    } finally {
      setSavingEvent(false)
    }
  }

  const submitEntry = async (event) => {
    event.preventDefault()
    if (!selectedEvent || !entryForm.title.trim() || entryFiles.length === 0) return
    setSavingEntry(true)
    setNotice('')
    setError('')
    try {
      await uploadClubEventEntry(selectedEvent.id, {
        title: entryForm.title.trim(),
        authorName: entryForm.authorName.trim(),
        description: entryForm.description.trim(),
        files: entryFiles,
      })
      const detail = await getClubEvent(selectedEvent.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
      resetEntryForm()
      event.currentTarget.reset()
      setNotice('회지 글을 이벤트에 등록했습니다.')
    } catch (err) {
      setError(err.message || '회지 글을 등록하지 못했습니다.')
    } finally {
      setSavingEntry(false)
    }
  }

  const handleVote = async (entry) => {
    if (!selectedEvent || votingEntryId) return
    setVotingEntryId(entry.id)
    setNotice('')
    setError('')
    try {
      const updated = await voteClubEventEntry(selectedEvent.id, entry.id)
      mergeEvent(updated)
      setSelectedSnapshot(updated)
      setNotice(`${entry.title}에 투표했습니다.`)
    } catch (err) {
      setError(err.message || '투표하지 못했습니다.')
    } finally {
      setVotingEntryId(null)
    }
  }

  const handleDeleteEvent = async (item) => {
    if (!window.confirm(`${item.title} 이벤트를 삭제할까요?`)) return
    setDeletingId(`event-${item.id}`)
    setError('')
    try {
      await deleteClubEvent(item.id)
      removeEvent(item.id)
      if (selectedEventId === item.id) {
        setSelectedEventId(null)
        setSelectedSnapshot(null)
        setMode('list')
      }
    } catch (err) {
      setError(err.message || '이벤트를 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteEntry = async (entry) => {
    if (!selectedEvent || !window.confirm(`${entry.title} 작품을 삭제할까요?`)) return
    setDeletingId(`entry-${entry.id}`)
    setError('')
    try {
      await deleteClubEventEntry(selectedEvent.id, entry.id)
      const detail = await getClubEvent(selectedEvent.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
    } catch (err) {
      setError(err.message || '작품을 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const renderEventForm = () => (
    <form onSubmit={submitEvent} className="club-event-admin-form" aria-label="이벤트 열기">
      <label className="club-event-field club-event-field-wide">
        <span>이벤트 제목</span>
        <input value={eventForm.title} onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))} maxLength={120} placeholder="예: 회지 인기투표" />
      </label>
      <label className="club-event-field">
        <span>투표 시작일</span>
        <input type="date" value={eventForm.startsOn} onChange={(event) => setEventForm((prev) => ({ ...prev, startsOn: event.target.value }))} />
      </label>
      <label className="club-event-field">
        <span>투표 종료일</span>
        <input type="date" value={eventForm.endsOn} onChange={(event) => setEventForm((prev) => ({ ...prev, endsOn: event.target.value }))} />
      </label>
      <label className="club-event-field club-event-field-wide">
        <span>설명</span>
        <textarea value={eventForm.description} onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))} rows={4} maxLength={500} placeholder="투표 안내와 기준을 적어주세요." />
      </label>
      <div className="club-event-form-actions">
        <button type="submit" className="apple-action-primary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm" disabled={savingEvent || !eventForm.title.trim() || !eventForm.startsOn || !eventForm.endsOn}>
          {savingEvent ? '여는 중...' : '이벤트 열기'}
        </button>
        <button type="button" className="apple-action-secondary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm" onClick={() => setMode('list')} disabled={savingEvent}>
          취소
        </button>
      </div>
    </form>
  )

  const renderEntryForm = () => {
    if (!isAdmin || !selectedEvent) return null
    return (
      <form onSubmit={submitEntry} className="club-event-entry-form community-compose-form" aria-label="이벤트 회지 글쓰기">
        <div className="club-event-entry-form-head">
          <div>
            <p className="apple-eyebrow">Community entry</p>
            <h3>회지 글쓰기</h3>
          </div>
          <span>본문과 PDF, 이미지, 압축 파일을 함께 등록합니다.</span>
        </div>
        <div className="club-event-entry-grid">
          <label className="club-event-field">
            <span>글 제목</span>
            <input value={entryForm.title} onChange={(event) => setEntryForm((prev) => ({ ...prev, title: event.target.value }))} maxLength={120} placeholder="예: 여름호" />
          </label>
          <label className="club-event-field">
            <span>작성자/팀</span>
            <input value={entryForm.authorName} onChange={(event) => setEntryForm((prev) => ({ ...prev, authorName: event.target.value }))} maxLength={80} placeholder="예: 운영팀" />
          </label>
          <label className="club-event-field club-event-field-wide">
            <span>본문</span>
            <textarea value={entryForm.description} onChange={(event) => setEntryForm((prev) => ({ ...prev, description: event.target.value }))} rows={5} maxLength={1000} placeholder="회지 소개, 투표 기준, 읽어볼 포인트를 적어주세요." />
          </label>
          <label className="club-event-upload-button">
            <Sparkles size={15} aria-hidden="true" />
            파일 추가
            <input type="file" multiple onChange={(event) => setEntryFiles(Array.from(event.target.files || []))} />
          </label>
          <span className="club-event-upload-name">
            {entryFiles.length > 0 ? `${entryFiles.length}개 선택됨 · ${entryFiles.map((file) => file.name).join(', ')}` : '선택된 파일 없음'}
          </span>
        </div>
        <button type="submit" className="apple-action-primary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm" disabled={savingEntry || !entryForm.title.trim() || entryFiles.length === 0}>
          {savingEntry ? '등록 중...' : '글 등록'}
        </button>
      </form>
    )
  }

  const renderDetail = () => {
    if (!selectedEvent) return <p className="px-4 py-16 text-center text-sm text-[var(--app-muted)]">이벤트를 여는 중...</p>
    const entries = Array.isArray(selectedEvent.entries) ? selectedEvent.entries : []
    return (
      <>
        <div className="club-event-detail-head">
          <button type="button" className="apple-action-secondary inline-flex items-center gap-1 px-4 py-2 text-sm" onClick={() => setMode('list')}>
            <ArrowLeft size={14} />
            목록
          </button>
          <div className="club-event-detail-title">
            <p className="apple-eyebrow">Event contest</p>
            <h2>{selectedEvent.title}</h2>
            {selectedEvent.description && <p>{selectedEvent.description}</p>}
          </div>
          <div className="club-event-status-card">
            <span className={selectedEvent.votingOpen ? 'club-event-status-open' : 'club-event-status-closed'}>{selectedEvent.votingOpen ? '투표 진행 중' : '투표 종료'}</span>
            <strong>{selectedEvent.totalVotes ?? 0}표</strong>
            <small>{formatEventWindow(selectedEvent)}</small>
          </div>
        </div>
        {renderEntryForm()}
        {entries.length > 0 ? (
          <div className="club-event-ranking-list">
            {entries.map((entry) => {
              const entryFileList = Array.isArray(entry.files) && entry.files.length > 0
                ? entry.files
                : (entry.downloadUrl ? [{
                    id: `${entry.id}-legacy-file`,
                    downloadUrl: entry.downloadUrl,
                    originalName: entry.originalName,
                    fileSize: entry.fileSize,
                  }] : [])
              return (
                <article key={entry.id} className={`club-event-entry-card ${entry.myVote ? 'club-event-entry-card-selected' : ''}`}>
                  <div className="club-event-rank-badge">{entry.rank}위</div>
                  <div className="club-event-entry-main">
                    <div className="club-event-entry-title-row">
                      <h3>{entry.title}</h3>
                      {entry.authorName && <span>{entry.authorName}</span>}
                      {entryFileList.length > 1 && <span>첨부 {entryFileList.length}개</span>}
                    </div>
                    {entry.description && <p>{entry.description}</p>}
                    {entryFileList.length > 0 && (
                      <div className="club-event-entry-files" aria-label={`${entry.title} 첨부파일`}>
                        {entryFileList.map((file) => (
                          <a key={file.id || file.downloadUrl || file.originalName} href={file.downloadUrl} className="club-event-download-link">
                            <Download size={14} aria-hidden="true" />
                            <span>{file.originalName || '첨부파일'}</span>
                            {formatFileSize(file.fileSize) && <small>{formatFileSize(file.fileSize)}</small>}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="club-event-entry-score">
                    <strong>{entry.voteCount ?? 0}표</strong>
                    <button type="button" onClick={() => handleVote(entry)} disabled={!selectedEvent.votingOpen || votingEntryId === entry.id} className={entry.myVote ? 'club-event-vote-button club-event-vote-button-selected' : 'club-event-vote-button'}>
                      <ThumbsUp size={15} aria-hidden="true" />
                      {entry.myVote ? '내 투표' : '투표'}
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => handleDeleteEntry(entry)} disabled={deletingId === `entry-${entry.id}`} className="club-event-danger-button" aria-label={`${entry.title} 삭제`}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="activity-empty-state m-4 sm:m-8">
            <Sparkles size={22} aria-hidden="true" />
            <div>
              <h3>아직 업로드된 작품이 없습니다.</h3>
              <p>관리자가 회지나 작품 파일을 추가하면 랭킹이 이곳에 표시됩니다.</p>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <section id="activity-events" className="club-event-section scroll-mt-24 bg-[var(--app-surface-soft)] px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="activity-board-shell apple-board-shell">
          {mode === 'list' && (
            <>
              <div className="club-event-hero px-4 py-7 sm:px-8 sm:py-10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <p className="apple-eyebrow">Event</p>
                    <h1 className="apple-display mt-3 break-words text-4xl sm:text-6xl">이벤트</h1>
                    <p className="apple-copy mt-4 max-w-2xl text-base sm:text-lg">회지, 작품, 활동 결과물을 모아 투표하고 랭킹으로 확인합니다. 등록된 실제 이벤트만 보여줍니다.</p>
                  </div>
                  {isAdmin && !isLocked && (
                    <button type="button" onClick={() => { setMode('write'); setError(''); setNotice('') }} className="apple-action-primary inline-flex w-full items-center justify-center px-5 py-3 text-sm sm:w-auto sm:py-2.5">
                      이벤트 열기
                    </button>
                  )}
                </div>
              </div>
              {authLoading || loading ? (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>이벤트를 불러오는 중...</h3>
                    <p>회원 상태와 진행 중인 투표를 확인하고 있습니다.</p>
                  </div>
                </div>
              ) : isLocked ? (
                <div className="activity-empty-state activity-locked-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>로그인 하세요</h3>
                    <p>회원 로그인 후 이벤트와 인기투표에 참여할 수 있습니다.</p>
                    <button type="button" onClick={() => navigate('/login')} className="apple-action-primary mt-3 inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm">로그인</button>
                  </div>
                </div>
              ) : visibleError ? (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>이벤트를 불러오지 못했습니다.</h3>
                    <p>{visibleError}</p>
                  </div>
                </div>
              ) : eventItems.length > 0 ? (
                <div className="club-event-list">
                  {eventItems.map((item) => (
                    <article key={item.id} className="club-event-list-card">
                      <button type="button" onClick={() => openEvent(item)} className="club-event-list-button">
                        <span className={item.votingOpen ? 'club-event-pill club-event-pill-open' : 'club-event-pill'}>{item.votingOpen ? '진행 중' : '종료'}</span>
                        <strong>{item.title}</strong>
                        {item.description && <span>{item.description}</span>}
                        <small>{formatEventWindow(item)}</small>
                      </button>
                      <div className="club-event-list-stats">
                        <span>{item.entryCount ?? 0}작품</span>
                        <span>{item.totalVotes ?? 0}표</span>
                        {isAdmin && (
                          <button type="button" onClick={() => handleDeleteEvent(item)} disabled={deletingId === `event-${item.id}`} className="club-event-danger-button" aria-label={`${item.title} 이벤트 삭제`}>
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>열린 이벤트가 없습니다.</h3>
                    <p>관리자가 회지 인기투표나 작품 이벤트를 열면 이곳에 표시됩니다.</p>
                  </div>
                </div>
              )}
            </>
          )}
          {mode === 'write' && (
            <>
              <div className="apple-board-minibar px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[var(--app-muted)]">
                    <span className="text-[var(--app-accent-text)]">Event</span>
                    <span className="size-1 rounded-full bg-[var(--app-subtle)]" />
                    <h1 className="text-xs font-semibold text-[var(--app-muted)]">이벤트 열기</h1>
                  </div>
                  <button type="button" onClick={() => setMode('list')} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
                    <ArrowLeft size={14} />
                    목록
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-5">{renderEventForm()}</div>
            </>
          )}
          {mode === 'detail' && renderDetail()}
          {(notice || error) && <div className={`club-event-toast ${error ? 'club-event-toast-error' : ''}`}>{error || notice}</div>}
        </div>
      </div>
    </section>
  )
}

const EMPTY_CALENDAR_SCHEDULE_FORM = {
  mode: 'date',
  title: '',
  startDate: '',
  endDate: '',
  daysOfWeek: [],
  startTime: '',
  endTime: '',
  colorHex: DEFAULT_SCHEDULE_COLOR,
}

function calendarFormFromDateSchedule(schedule) {
  if (!schedule) {
    return { ...EMPTY_CALENDAR_SCHEDULE_FORM, daysOfWeek: [] }
  }
  return {
    mode: 'date',
    title: schedule.title || '',
    startDate: schedule.eventDate || schedule.startDate || '',
    endDate: schedule.endDate || schedule.eventDate || schedule.startDate || '',
    daysOfWeek: [],
    startTime: schedule.startTime || '',
    endTime: schedule.endTime || '',
    colorHex: schedule.colorHex || DEFAULT_SCHEDULE_COLOR,
  }
}

function CalendarScheduleComposer({ onDateCreated, onDateUpdated, editingDateSchedule, onDateEditDone }) {
  const queryClient = useQueryClient()
  const { user, loading: authLoading } = useAuth()
  const [form, setForm] = useState(() => calendarFormFromDateSchedule(editingDateSchedule))
  const [editingRecurringId, setEditingRecurringId] = useState(null)
  const [csvText, setCsvText] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvNotice, setCsvNotice] = useState('')
  const [csvError, setCsvError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(editingDateSchedule ? '선택한 날짜 일정을 수정 중입니다.' : '')
  const [error, setError] = useState('')

  const listQuery = useQuery({
    queryKey: RECURRING_SCHEDULES_QUERY_KEY,
    queryFn: async () => {
      const data = await listRecurringSchedules()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })
  const schedules = listQuery.data ?? []

  const setMode = (mode) => {
    setForm((prev) => ({ ...prev, mode }))
    setEditingRecurringId(null)
    if (editingDateSchedule) onDateEditDone?.()
    setNotice('')
    setError('')
  }

  const toggleDay = (value) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(value)
        ? prev.daysOfWeek.filter((d) => d !== value)
        : [...prev.daysOfWeek, value],
    }))
  }

  const resetForm = () => {
    setForm(EMPTY_CALENDAR_SCHEDULE_FORM)
    setEditingRecurringId(null)
    onDateEditDone?.()
    setNotice('')
    setError('')
  }

  const resetAfterSave = () => {
    setForm((prev) => ({
      ...EMPTY_CALENDAR_SCHEDULE_FORM,
      mode: prev.mode,
      daysOfWeek: prev.mode === 'recurring' ? prev.daysOfWeek : [],
      startTime: prev.startTime,
      endTime: prev.endTime,
      colorHex: prev.colorHex || DEFAULT_SCHEDULE_COLOR,
    }))
    setEditingRecurringId(null)
    onDateEditDone?.()
  }

  const startEdit = (schedule) => {
    setEditingRecurringId(schedule.id)
    setForm({
      mode: 'recurring',
      title: schedule.title || '',
      startDate: schedule.startDate || '',
      endDate: schedule.endDate || '',
      daysOfWeek: Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [],
      startTime: schedule.startTime || '',
      endTime: schedule.endTime || '',
      colorHex: schedule.colorHex || DEFAULT_SCHEDULE_COLOR,
    })
    setNotice('')
    setError('')
  }

  const refreshCalendar = () => {
    queryClient.invalidateQueries({ queryKey: RECURRING_SCHEDULES_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: SCHEDULE_OCCURRENCES_QUERY_KEY })
  }

  const submit = async (event) => {
    event.preventDefault()
    const title = form.title.trim()
    const endDate = form.endDate || form.startDate
    if (!title || !form.startDate) {
      setError('일정 제목과 시작일을 입력하세요.')
      return
    }
    if (endDate < form.startDate) {
      setError('종료일은 시작일과 같거나 이후여야 합니다.')
      return
    }
    if (form.startTime && form.endTime && form.endTime < form.startTime) {
      setError('종료 시간은 시작 시간 이후여야 합니다.')
      return
    }
    if (form.mode === 'recurring' && form.daysOfWeek.length === 0) {
      setError('정기 모임은 반복 요일을 하나 이상 선택하세요.')
      return
    }
    setSaving(true)
    setNotice('')
    setError('')
    try {
      if (form.mode === 'date') {
        const payload = {
          kind: 'SCHEDULE',
          category: editingDateSchedule?.category || 'GENERAL',
          title,
          eventDate: form.startDate,
          endDate,
          startTime: form.startTime,
          endTime: form.endTime,
          colorHex: form.colorHex,
          description: editingDateSchedule?.description || '',
        }
        if (editingDateSchedule?.id) {
          const updated = await updateClubActivity(editingDateSchedule.id, payload)
          onDateUpdated?.(updated)
          setNotice('날짜 일정을 수정했습니다.')
        } else {
          const created = await createClubActivity(payload)
          onDateCreated?.(created)
          setNotice('날짜 일정을 추가했습니다.')
        }
      } else {
        const payload = {
          title,
          description: null,
          startDate: form.startDate,
          endDate,
          daysOfWeek: form.daysOfWeek,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          colorHex: form.colorHex,
          location: null,
          category: null,
        }
        if (editingRecurringId) {
          await updateRecurringSchedule(editingRecurringId, payload)
          setNotice('정기 모임을 수정했습니다.')
        } else {
          await createRecurringSchedule(payload)
          setNotice('정기 모임을 추가했습니다.')
        }
        refreshCalendar()
      }
      resetAfterSave()
    } catch (err) {
      setError(err.message || '일정을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCsvText(await file.text())
    setCsvNotice(`${file.name} 내용을 불러왔습니다.`)
    setCsvError('')
  }

  const importCsv = async () => {
    const parsed = parseScheduleCsv(csvText)
    if (parsed.errors.length > 0) {
      setCsvNotice('')
      setCsvError(parsed.errors.map((entry) => `${entry.line}행: ${entry.message}`).join(' '))
      return
    }
    if (parsed.rows.length === 0) {
      setCsvNotice('')
      setCsvError('가져올 일정이 없습니다.')
      return
    }
    setCsvImporting(true)
    setCsvNotice('')
    setCsvError('')
    try {
      let importedCount = 0
      for (const row of parsed.rows) {
        if (row.type === 'date') {
          const created = await createClubActivity({
            kind: 'SCHEDULE',
            category: 'GENERAL',
            title: row.title,
            eventDate: row.startDate,
            endDate: row.endDate || row.startDate,
            startTime: row.startTime,
            endTime: row.endTime,
            colorHex: row.colorHex,
          })
          onDateCreated?.(created)
        } else {
          await createRecurringSchedule({
            title: row.title,
            description: null,
            startDate: row.startDate,
            endDate: row.endDate,
            daysOfWeek: row.daysOfWeek,
            startTime: row.startTime || null,
            endTime: row.endTime || null,
            colorHex: row.colorHex,
            location: null,
            category: null,
          })
        }
        importedCount += 1
      }
      refreshCalendar()
      setCsvNotice(`CSV에서 일정 ${importedCount}개를 가져왔습니다.`)
    } catch (err) {
      setCsvError(err.message || 'CSV 일정을 가져오지 못했습니다.')
    } finally {
      setCsvImporting(false)
    }
  }

  const remove = async (schedule) => {
    if (typeof window !== 'undefined' && !window.confirm(`'${schedule.title}' 정기 모임을 삭제할까요?`)) return
    setError('')
    setNotice('')
    try {
      await deleteRecurringSchedule(schedule.id)
      if (editingRecurringId === schedule.id) resetForm()
      setNotice('정기 모임을 삭제했습니다.')
      refreshCalendar()
    } catch (err) {
      setError(err.message || '정기 모임을 삭제하지 못했습니다.')
    }
  }

  return (
    <div className="recurring-schedule-manager mt-6">
      <form onSubmit={submit} className="calendar-admin-composer calendar-admin-composer-unified" aria-label="캘린더 일정 관리">
        <div className="calendar-admin-composer-heading">
          <p className="calendar-admin-composer-title">
            {editingDateSchedule ? '날짜 일정 수정' : (editingRecurringId ? '정기 모임 수정' : '관리자 일정 추가')}
          </p>
          <p className="calendar-admin-composer-copy">처음에 날짜 일정인지 정기 모임인지 선택하고, 제목·기간·시간만 입력합니다.</p>
        </div>
        <div className="calendar-admin-mode-tabs" role="radiogroup" aria-label="일정 종류 선택">
          <button
            type="button"
            className={form.mode === 'date' ? 'is-active' : ''}
            onClick={() => setMode('date')}
            aria-pressed={form.mode === 'date'}
            aria-label="날짜 일정"
            disabled={saving}
          >
            <span className="calendar-admin-mode-tab-main" aria-hidden="true">
              <span className="calendar-admin-mode-tab-label">날짜 일정</span>
              <span className="calendar-admin-mode-tab-copy">하루 또는 기간 일정</span>
            </span>
            {form.mode === 'date' && <span className="calendar-admin-mode-badge" aria-hidden="true">선택 중</span>}
          </button>
          <button
            type="button"
            className={form.mode === 'recurring' ? 'is-active' : ''}
            onClick={() => setMode('recurring')}
            aria-pressed={form.mode === 'recurring'}
            aria-label="정기 모임"
            disabled={saving || Boolean(editingDateSchedule)}
          >
            <span className="calendar-admin-mode-tab-main" aria-hidden="true">
              <span className="calendar-admin-mode-tab-label">정기 모임</span>
              <span className="calendar-admin-mode-tab-copy">매주 반복되는 일정</span>
            </span>
            {form.mode === 'recurring' && <span className="calendar-admin-mode-badge" aria-hidden="true">선택 중</span>}
          </button>
        </div>
        <label>
          <span>일정 제목</span>
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            maxLength={120}
          />
        </label>
        <label>
          <span>시작일</span>
          <input
            type="date"
            value={form.startDate}
            onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
          />
        </label>
        <label>
          <span>{form.mode === 'date' ? '종료일 (선택)' : '종료일'}</span>
          <input
            type="date"
            value={form.endDate}
            onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
          />
        </label>
        {form.mode === 'recurring' && (
          <div className="calendar-admin-composer-wide recurring-weekday-picker" role="group" aria-labelledby="recurring-weekday-label">
            <span id="recurring-weekday-label" className="recurring-weekday-label">반복 요일</span>
            <div className="recurring-weekday-options">
              {WEEKDAY_OPTIONS.map((weekday) => (
                <label key={weekday.value} className={`recurring-weekday-option ${form.daysOfWeek.includes(weekday.value) ? 'is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.daysOfWeek.includes(weekday.value)}
                    onChange={() => toggleDay(weekday.value)}
                  />
                  <span>{weekday.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <label>
          <span>시작 시간 (선택)</span>
          <input
            type="time"
            value={form.startTime}
            onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
          />
        </label>
        <label>
          <span>종료 시간 (선택)</span>
          <input
            type="time"
            value={form.endTime}
            onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
          />
        </label>
        <div className="calendar-color-picker">
          <span>일정 색상</span>
          <div className="calendar-color-swatches" aria-label="빠른 색상 선택">
            {SCHEDULE_COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                className={form.colorHex === color ? 'is-active' : ''}
                style={{ '--calendar-swatch-color': color }}
                onClick={() => setForm((prev) => ({ ...prev, colorHex: color }))}
                aria-label={`${color} 색상 선택`}
                aria-pressed={form.colorHex === color}
                disabled={saving}
              />
            ))}
          </div>
          <input
            aria-label="일정 색상"
            type="color"
            value={form.colorHex || DEFAULT_SCHEDULE_COLOR}
            onChange={(event) => setForm((prev) => ({ ...prev, colorHex: event.target.value }))}
            disabled={saving}
          />
        </div>
        <div className="calendar-admin-composer-actions">
          <button
            type="submit"
            disabled={saving || !form.title.trim() || !form.startDate || (form.mode === 'recurring' && (!form.endDate || form.daysOfWeek.length === 0))}
          >
            {saving ? '저장 중...' : (editingDateSchedule ? '날짜 일정 수정' : (editingRecurringId ? '정기 모임 수정' : (form.mode === 'date' ? '날짜 일정 추가' : '정기 모임 등록')))}
          </button>
          {(editingRecurringId || editingDateSchedule) && (
            <button type="button" className="recurring-cancel-edit" onClick={resetForm} disabled={saving}>
              취소
            </button>
          )}
        </div>
        {notice && <p className="calendar-admin-composer-notice">{notice}</p>}
        {error && <p className="calendar-admin-composer-notice" style={{ color: '#dc2626' }}>{error}</p>}
      </form>

      <div className="calendar-csv-import mt-4">
        <div>
          <p className="calendar-admin-composer-title">학기 일정 CSV 가져오기</p>
          <p className="calendar-admin-composer-copy">type,title,startDate,endDate,startTime,endTime,daysOfWeek 형식으로 날짜 일정과 정기 모임을 한 번에 등록합니다.</p>
        </div>
        <textarea
          aria-label="학기 일정 CSV"
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder="종류,제목,시작일,종료일,시작시간,종료시간,요일"
        />
        <div className="calendar-csv-import-actions">
          <label>
            CSV 파일 선택
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
          </label>
          <button type="button" onClick={importCsv} disabled={csvImporting || !csvText.trim()}>
            {csvImporting ? '가져오는 중...' : 'CSV 일정 가져오기'}
          </button>
        </div>
        {csvNotice && <p className="calendar-admin-composer-notice">{csvNotice}</p>}
        {csvError && <p className="calendar-admin-composer-notice" style={{ color: '#dc2626' }}>{csvError}</p>}
      </div>

      {schedules.length > 0 && (
        <ul className="recurring-schedule-list mt-4">
          {schedules.map((schedule) => {
            const dayLabels = (schedule.daysOfWeek || []).map((d) => WEEKDAY_SHORT[d] || d).join('·')
            const timeLabel = schedule.startTime
              ? (schedule.endTime ? `${schedule.startTime}~${schedule.endTime}` : schedule.startTime)
              : ''
            return (
              <li key={schedule.id} className={`recurring-schedule-item ${editingRecurringId === schedule.id ? 'recurring-schedule-item-selected' : ''}`}>
                <div className="recurring-schedule-item-main">
                  <span className="recurring-schedule-item-title">
                    <Repeat size={13} aria-hidden="true" /> {schedule.title}
                    {editingRecurringId === schedule.id && <span className="recurring-schedule-item-badge">수정 중</span>}
                  </span>
                  <span className="recurring-schedule-item-meta">
                    {formatActivityDate(schedule.startDate)} ~ {formatActivityDate(schedule.endDate)}
                    {dayLabels && ` · ${dayLabels}요일`}
                    {timeLabel && ` · ${timeLabel}`}
                  </span>
                </div>
                <div className="recurring-schedule-item-actions">
                  <button type="button" onClick={() => startEdit(schedule)}>수정</button>
                  <button type="button" className="recurring-schedule-delete" onClick={() => remove(schedule)} aria-label="삭제">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ClubCalendarSection({ compact = false }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, authLoading, records, loading, loadError, prependActivity, mergeActivity, removeActivity } = useClubActivities('일정을 불러오지 못했습니다.')
  const initialCalendarDate = new Date()
  const error = loadError
  const [selectedYear, setSelectedYear] = useState(initialCalendarDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(initialCalendarDate.getMonth())
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [editingDateSchedule, setEditingDateSchedule] = useState(null)
  const [calendarNotice, setCalendarNotice] = useState('')
  const [calendarActionError, setCalendarActionError] = useState('')
  const [exceptionEditor, setExceptionEditor] = useState(null)
  const [exceptionSaving, setExceptionSaving] = useState(false)

  const occurrences = useScheduleOccurrences(selectedYear, selectedMonth)
  const scheduleItems = (user ? records || [] : []).filter((item) => item.kind === 'SCHEDULE')
  const calendarMonth = buildCalendarMonth(new Date(selectedYear, selectedMonth, 1))
  const eventsByDay = buildCalendarDayEvents({
    calendarMonth,
    scheduleItems,
    recurringOccurrences: user ? occurrences : [],
  })
  const hasAnyEvent = Object.values(eventsByDay).some((list) => list.length > 0)
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'
  const selectedDayEvents = selectedDay ? eventsByDay[selectedDay] || [] : []
  const activeSelectedEventId = selectedDayEvents.some((event) => event.id === selectedEventId) ? selectedEventId : null
  const monthSummary = buildMonthEventSummary({
    eventsByDay,
    calendarMonth,
    today: new Date(selectedYear, selectedMonth, 1),
    limit: 3,
  })

  const updateSelectedYear = (value) => {
    const nextYear = Number(value)
    if (!Number.isFinite(nextYear)) return
    setSelectedDay(null)
    setSelectedEventId(null)
    setSelectedYear(Math.min(2100, Math.max(2000, nextYear)))
  }

  const selectCalendarDay = (day) => {
    setSelectedDay(day)
    setSelectedEventId(null)
  }

  const selectCalendarEvent = (day, event) => {
    setSelectedDay(day)
    setSelectedEventId(event.id)
  }

  const refreshOccurrences = () => {
    queryClient.invalidateQueries({ queryKey: SCHEDULE_OCCURRENCES_QUERY_KEY })
  }

  const handleDateCreated = (created) => {
    prependActivity(created)
    const createdDate = parseLocalDate(created.eventDate)
    if (createdDate) {
      setSelectedYear(createdDate.getFullYear())
      setSelectedMonth(createdDate.getMonth())
      setSelectedDay(createdDate.getDate())
      setSelectedEventId(null)
    }
  }

  const handleDateUpdated = (updated) => {
    mergeActivity(updated)
    setEditingDateSchedule(null)
    const updatedDate = parseLocalDate(updated.eventDate)
    if (updatedDate) {
      setSelectedYear(updatedDate.getFullYear())
      setSelectedMonth(updatedDate.getMonth())
      setSelectedDay(updatedDate.getDate())
      setSelectedEventId(null)
    }
  }

  const startDateEdit = (event) => {
    const activity = scheduleItems.find((item) => item.id === event.activityId)
    if (!activity) return
    setEditingDateSchedule(activity)
    setCalendarNotice('')
    setCalendarActionError('')
  }

  const deleteDateSchedule = async (event) => {
    if (!event.activityId) return
    if (typeof window !== 'undefined' && !window.confirm(`'${event.title}' 날짜 일정을 삭제할까요?`)) return
    setCalendarNotice('')
    setCalendarActionError('')
    try {
      await deleteClubActivity(event.activityId)
      removeActivity(event.activityId)
      setEditingDateSchedule(null)
      setSelectedEventId(null)
      setCalendarNotice('날짜 일정을 삭제했습니다.')
    } catch (err) {
      setCalendarActionError(err.message || '날짜 일정을 삭제하지 못했습니다.')
    }
  }

  const cancelRecurringOccurrence = async (event) => {
    setExceptionSaving(true)
    setCalendarNotice('')
    setCalendarActionError('')
    try {
      await upsertRecurringScheduleException(event.recurringScheduleId, event.date, {
        canceled: true,
        startTime: null,
        endTime: null,
      })
      refreshOccurrences()
      setCalendarNotice('이번 주 정기 일정을 취소 처리했습니다.')
    } catch (err) {
      setCalendarActionError(err.message || '정기 일정 예외를 저장하지 못했습니다.')
    } finally {
      setExceptionSaving(false)
    }
  }

  const clearRecurringException = async (event) => {
    setExceptionSaving(true)
    setCalendarNotice('')
    setCalendarActionError('')
    try {
      await deleteRecurringScheduleException(event.recurringScheduleId, event.date)
      refreshOccurrences()
      setExceptionEditor(null)
      setCalendarNotice('이번 주 예외를 해제했습니다.')
    } catch (err) {
      setCalendarActionError(err.message || '정기 일정 예외를 해제하지 못했습니다.')
    } finally {
      setExceptionSaving(false)
    }
  }

  const startExceptionEdit = (event) => {
    setExceptionEditor({
      eventId: event.id,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
    })
    setCalendarNotice('')
    setCalendarActionError('')
  }

  const saveExceptionEdit = async (event) => {
    if (!exceptionEditor) return
    if (exceptionEditor.startTime && exceptionEditor.endTime && exceptionEditor.endTime < exceptionEditor.startTime) {
      setCalendarActionError('종료 시간은 시작 시간 이후여야 합니다.')
      return
    }
    setExceptionSaving(true)
    setCalendarNotice('')
    setCalendarActionError('')
    try {
      await upsertRecurringScheduleException(event.recurringScheduleId, event.date, {
        canceled: false,
        startTime: exceptionEditor.startTime || null,
        endTime: exceptionEditor.endTime || null,
      })
      refreshOccurrences()
      setExceptionEditor(null)
      setCalendarNotice('이번 주 정기 일정 시간을 변경했습니다.')
    } catch (err) {
      setCalendarActionError(err.message || '정기 일정 시간을 변경하지 못했습니다.')
    } finally {
      setExceptionSaving(false)
    }
  }

  const eventMeta = (event) => {
    const rangeLabel = event.range && event.startDate !== event.endDate
      ? `${formatActivityDate(event.startDate)} ~ ${formatActivityDate(event.endDate)}`
      : formatActivityDate(event.date)
    return [rangeLabel, event.timeLabel, event.canceled ? '취소됨' : '', event.recurring ? '정기 모임' : '날짜 일정'].filter(Boolean).join(' · ')
  }

  return (
    <section id="monthly-calendar" className={`club-calendar-section ${compact ? 'club-calendar-section-compact' : ''} scroll-mt-24 bg-[var(--app-surface-soft)] px-5 py-12 sm:py-16`}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="apple-eyebrow">Monthly calendar</p>
            <h2 className="apple-display mt-3 text-4xl sm:text-5xl">동아리 일정 캘린더</h2>
            <p className="apple-copy mt-4 max-w-2xl text-lg">
              공지사항 목록만으로 놓치기 쉬운 정기 회의, 세미나, 스터디, 발표, 모집 마감, MT/행사를 월별 흐름으로 확인합니다.
            </p>
          </div>
          <div className="club-calendar-title">
            <CalendarDays size={18} aria-hidden="true" />
            <span>{calendarMonth.title}</span>
          </div>
        </div>
        <div className="club-calendar-controls mt-5" aria-label="달력 년도와 월 선택">
          <label>
            <span>년도</span>
            <input
              type="number"
              min="2000"
              max="2100"
              step="1"
              value={selectedYear}
              onChange={(event) => updateSelectedYear(event.target.value)}
              aria-label="년도 선택"
            />
          </label>
          <label>
            <span>월</span>
            <select
              value={selectedMonth}
              onChange={(event) => {
                setSelectedDay(null)
                setSelectedEventId(null)
                setSelectedMonth(Number(event.target.value))
              }}
              aria-label="월 선택"
            >
              {calendarMonthOptions.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </label>
        </div>

        {isAdmin && !isLocked && (
          <CalendarScheduleComposer
            key={editingDateSchedule ? `date-edit-${editingDateSchedule.id}` : 'calendar-composer'}
            onDateCreated={handleDateCreated}
            onDateUpdated={handleDateUpdated}
            editingDateSchedule={editingDateSchedule}
            onDateEditDone={() => setEditingDateSchedule(null)}
          />
        )}

        {!isLocked && monthSummary.length > 0 && (
          <div className="calendar-month-summary mt-6">
            <div>
              <p>이번 달 예정 일정 {monthSummary.length}개</p>
              <span>{calendarMonth.title}에서 먼저 확인할 일정입니다.</span>
            </div>
            <ul>
              {monthSummary.map((event) => (
                <li key={`summary-${event.id}`}>
                  <strong>{event.title}</strong>
                  <span>{eventMeta(event)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="club-calendar-shell mt-8">
          <div className="club-calendar-weekdays" aria-hidden="true">
            {calendarWeekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="club-calendar-grid">
            {Array.from({ length: calendarMonth.leadingBlanks }, (_, index) => (
              <div key={`leading-${index}`} className="club-calendar-day club-calendar-day-empty" aria-hidden="true" />
            ))}
            {calendarMonth.days.map((day) => {
              const dayEvents = eventsByDay[day] || []
              const { visible, overflowCount } = visibleDayEvents(dayEvents, 3)
              return (
                <div key={day} className={`club-calendar-day ${dayEvents.length ? 'club-calendar-day-active' : ''} ${selectedDay === day ? 'club-calendar-day-selected' : ''}`}>
                  <button
                    type="button"
                    className="club-calendar-day-number"
                    onClick={() => selectCalendarDay(day)}
                    aria-label={`${day}일 일정 보기`}
                    aria-pressed={selectedDay === day}
                  >
                    {day}
                  </button>
                  {selectedDay === day && <span className="club-calendar-day-selected-label" aria-hidden="true">선택한 날짜</span>}
                  <div className="club-calendar-events">
                    {visible.map((event) => (
                      <button
                        type="button"
                        key={event.id}
                        className={`club-calendar-event ${event.range ? `club-calendar-event-range club-calendar-event-range-${event.segment}` : ''} ${event.recurring ? 'club-calendar-event-recurring' : ''} ${event.canceled ? 'club-calendar-event-canceled' : ''} ${activeSelectedEventId === event.id ? 'club-calendar-event-selected' : ''}`}
                        title={[event.title, eventMeta(event)].filter(Boolean).join(' · ')}
                        onClick={() => selectCalendarEvent(day, event)}
                        aria-pressed={activeSelectedEventId === event.id}
                        style={event.colorHex ? { '--calendar-event-color': event.colorHex } : undefined}
                      >
                        {event.recurring && <Repeat size={11} aria-label="반복 일정" className="club-calendar-event-icon" />}
                        <span className="club-calendar-event-title">{event.showTitle ? event.title : ''}</span>
                        {event.showTitle && event.timeLabel && (
                          <span className="club-calendar-event-meta">{event.timeLabel}</span>
                        )}
                        {event.showTitle && event.canceled && (
                          <span className="club-calendar-event-badge">취소됨</span>
                        )}
                        {activeSelectedEventId === event.id && (
                          <span className="club-calendar-event-selected-mark" aria-hidden="true">선택됨</span>
                        )}
                      </button>
                    ))}
                    {overflowCount > 0 && (
                      <button type="button" className="club-calendar-event-overflow" onClick={() => selectCalendarDay(day)}>
                        +{overflowCount}개
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {Array.from({ length: calendarMonth.trailingBlanks }, (_, index) => (
              <div key={`trailing-${index}`} className="club-calendar-day club-calendar-day-empty" aria-hidden="true" />
            ))}
          </div>
          {selectedDay && selectedDayEvents.length > 0 && (
            <div className="calendar-day-detail">
              <div className="calendar-day-detail-header">
                <div>
                  <strong>{calendarMonth.title} {selectedDay}일</strong>
                  <span>{selectedDayEvents.length}개 일정</span>
                </div>
                <button type="button" onClick={() => { setSelectedDay(null); setSelectedEventId(null) }} aria-label="선택한 날짜 닫기">
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
              <ul>
                {selectedDayEvents.map((event) => (
                  <li
                    key={`detail-${event.id}`}
                    className={`${event.canceled ? 'calendar-day-detail-canceled' : ''} ${activeSelectedEventId === event.id ? 'calendar-day-detail-selected' : ''}`}
                    style={event.colorHex ? { '--calendar-event-color': event.colorHex } : undefined}
                  >
                    <span className="calendar-day-detail-dot" aria-hidden="true" />
                    <div>
                      <div className="calendar-day-detail-title-row">
                        <strong>{event.title}</strong>
                        {activeSelectedEventId === event.id && (
                          <span className="calendar-day-detail-selected-badge">선택한 일정</span>
                        )}
                      </div>
                      <span>{eventMeta(event)}</span>
                      {isAdmin && !event.recurring && (
                        <div className="calendar-day-detail-actions">
                          <button type="button" onClick={() => startDateEdit(event)}>날짜 일정 수정 시작</button>
                          <button type="button" className="is-danger" onClick={() => deleteDateSchedule(event)}>날짜 일정 삭제</button>
                        </div>
                      )}
                      {isAdmin && event.recurring && (
                        <div className="calendar-day-detail-actions">
                          {!event.canceled && (
                            <button type="button" onClick={() => cancelRecurringOccurrence(event)} disabled={exceptionSaving}>이번 일정 취소</button>
                          )}
                          <button type="button" onClick={() => startExceptionEdit(event)} disabled={exceptionSaving}>시간 변경</button>
                          {(event.exceptionId || event.canceled) && (
                            <button type="button" className="is-danger" onClick={() => clearRecurringException(event)} disabled={exceptionSaving}>예외 해제</button>
                          )}
                        </div>
                      )}
                      {exceptionEditor?.eventId === event.id && (
                        <div className="calendar-exception-editor">
                          <label>
                            <span>예외 시작 시간</span>
                            <input
                              type="time"
                              value={exceptionEditor.startTime}
                              onChange={(changeEvent) => setExceptionEditor((prev) => ({ ...prev, startTime: changeEvent.target.value }))}
                            />
                          </label>
                          <label>
                            <span>예외 종료 시간</span>
                            <input
                              type="time"
                              value={exceptionEditor.endTime}
                              onChange={(changeEvent) => setExceptionEditor((prev) => ({ ...prev, endTime: changeEvent.target.value }))}
                            />
                          </label>
                          <button type="button" onClick={() => saveExceptionEdit(event)} disabled={exceptionSaving}>
                            시간 변경 저장
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {(calendarNotice || calendarActionError) && (
                <p className={`calendar-day-detail-message ${calendarActionError ? 'is-error' : ''}`}>
                  {calendarActionError || calendarNotice}
                </p>
              )}
            </div>
          )}
          {(authLoading || loading) && (
            <div className="calendar-empty-state">
              동아리 일정을 불러오는 중입니다.
            </div>
          )}
          {isLocked && (
            <div className="calendar-empty-state">
              <strong>회원 전용 일정</strong>
              <span>회원 로그인 후 월별 동아리 일정을 확인할 수 있습니다.</span>
              <button type="button" onClick={() => navigate('/login')} className="apple-action-primary ml-2 inline-flex min-h-9 items-center justify-center px-3 py-1.5 text-xs">
                로그인
              </button>
            </div>
          )}
          {!isLocked && !loading && error && (
            <div className="calendar-empty-state">
              {error}
            </div>
          )}
          {!isLocked && !loading && !error && !hasAnyEvent && (
            <div className="calendar-empty-state">
              등록된 일정이 없습니다. 실제 정기 회의, 세미나, 스터디, 프로젝트 발표, 모집 마감, MT/행사 일정이 추가되면 캘린더에 표시됩니다.
            </div>
          )}
        </div>
      </div>
    </section>
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
}) {
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

        const phrases = Array.from(titleEl.querySelectorAll('.apple-detail-title-phrase'))
        if (phrases.length === 0) return

        const availableWidth = titleEl.clientWidth
        const currentFit = Number.parseFloat(getComputedStyle(titleEl).getPropertyValue('--apple-title-fit')) || 1
        const widestPhrase = phrases.reduce((max, phrase) => Math.max(max, phrase.scrollWidth / currentFit), 0)
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
  const latestNoticeQuery = useQuery({
    queryKey: LATEST_NOTICE_QUERY_KEY,
    queryFn: listNotices,
    select: (data) => {
      const notices = Array.isArray(data) ? data : []
      return notices.find((n) => (n.category || 'GENERAL') === 'GENERAL') ?? null
    },
  })
  const latestNotice = latestNoticeQuery.data ?? null

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
  const goPageTop = (to, options) => {
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
            <p className="apple-eyebrow">{sectionMeta[id].eyebrow}</p>
            <h2 className="apple-display mt-4 text-5xl sm:text-6xl lg:text-7xl">{story.title}</h2>
            <p className="apple-copy mx-auto mt-6 max-w-3xl text-xl sm:text-2xl">{story.body}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
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
            {metrics.map((item) => (
              <div key={item.value} className="apple-soft-panel px-4 py-5 text-center">
                <p className="text-lg font-semibold text-[var(--app-text)]">{item.value}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-muted)]">{item.label}</p>
              </div>
            ))}
          </div>

          {id === 'about' && (
            <div className="mt-10 grid gap-3 lg:grid-cols-3">
              {showcaseItems.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => openPanel(item.target)}
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
                <article key={item.title} className="apple-product-panel px-6 py-6 text-left transition hover:-translate-y-0.5">
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
          <div className="flex items-center justify-center">
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

      <main className="apple-home-main relative overflow-hidden">
        <section className="apple-home-hero relative flex min-h-[calc(78svh-44px)] items-center justify-center overflow-hidden bg-[var(--app-surface-soft)] px-5 py-10 text-center sm:min-h-[calc(84svh-44px)] sm:py-12">
          <div className="home-hero-surface absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-b from-transparent to-white/82" />
          <div className="relative z-10 mx-auto w-full max-w-5xl">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/64 px-3 py-1.5 text-xs font-semibold text-[var(--app-muted)] shadow-[0_4px_16px_rgba(0,0,0,0.05)] backdrop-blur-xl">
              <span className="size-2 rounded-full bg-[var(--app-accent)]" />
              2026 Semester Ready
            </div>
            <div className="relative mx-auto mt-6 flex h-28 w-28 items-center justify-center sm:mt-7 sm:h-36 sm:w-36">
              <div className="absolute inset-0 rounded-[1.75rem] bg-white/82 shadow-[0_18px_54px_rgba(0,0,0,0.09)] ring-1 ring-black/5" />
              <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="home-logo-float relative z-10 h-20 w-20 object-contain sm:h-24 sm:w-24" />
            </div>
            <p className="mt-6 text-sm font-semibold text-[var(--app-muted)]">Kwangwoon University Computer Club</p>
            <h2 className="apple-display mt-2 whitespace-nowrap text-[3.2rem] sm:text-8xl lg:text-[8.5rem]">
              KW COM&apos;s
            </h2>
            <p className="apple-copy mx-auto mt-5 max-w-[20rem] text-lg sm:max-w-3xl sm:text-2xl">
              배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => openPanel('about')} className={solidActionBtnClass}>더 알아보기</button>
              <button type="button" onClick={goRecruitPage} className={ghostActionBtnClass}>지원하기</button>
            </div>
            {latestNotice && (
              <button type="button" onClick={goNotices} className="mx-auto mt-7 flex max-w-md items-center gap-2 rounded-full bg-[var(--app-surface)] px-4 py-2 text-left shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition hover:shadow-[0_5px_18px_rgba(0,0,0,0.12)]">
                <Megaphone size={14} className="shrink-0 text-[var(--app-accent-text)]" />
                <span className="truncate text-xs font-semibold text-[var(--app-text)]">{latestNotice.title}</span>
                <span className="ml-auto shrink-0 text-[10px] font-bold uppercase text-[var(--app-accent-text)]">공지</span>
              </button>
            )}
            <div className="mx-auto mt-6 flex max-w-[21rem] flex-wrap justify-center gap-2 sm:max-w-3xl">
              {experiencePills.map((pill) => (
                <span key={pill} className="rounded-full bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--app-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:px-3 sm:text-xs">
                  {pill}
                </span>
              ))}
            </div>
            <div className="apple-hero-metrics mx-auto mt-8 hidden max-w-3xl grid-cols-3 sm:grid">
              {heroHighlights.map((item) => (
                <div key={item.value} className="px-5 text-center">
                  <p className="text-[11px] font-semibold text-[var(--app-subtle)]">{item.label}</p>
                  <p className="mt-1 text-base font-semibold text-[var(--app-text)]">{item.value}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="apple-showcase-strip bg-[var(--app-surface)] px-5 py-4 sm:py-6">
          <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-3">
            {showcaseItems.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => openPanel(item.target)}
                className="apple-product-panel apple-showcase-card group flex min-h-[12rem] flex-col px-6 py-6 text-left text-[var(--app-text)] transition hover:-translate-y-0.5"
              >
                <p className="text-sm font-semibold text-[var(--app-accent-text)]">{item.eyebrow}</p>
                <h3 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-[var(--app-text)]">{item.title}</h3>
                <p className="mt-4 max-w-sm leading-7 text-[var(--app-muted)]">{item.body}</p>
                <span className="apple-action-primary mt-8 inline-flex w-fit items-center px-4 py-2 text-sm">더 보기</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-[var(--app-surface-soft)] px-5 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="apple-eyebrow">Member loop</p>
                <h2 className="apple-display mt-3 text-4xl sm:text-5xl">활동 허브</h2>
                <p className="apple-copy mt-3 max-w-2xl text-lg">
                  공지, 커뮤니티, 자료실을 한 번에 이어서 부원이 다시 들어올 이유를 분명하게 만듭니다.
                </p>
              </div>
              <button type="button" onClick={() => goPageTop('/notices')} className={ghostActionBtnClass}>최근 공지 보기</button>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {activityHubItems.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => goPageTop(item.route)}
                  className="apple-product-panel min-h-44 px-6 py-6 text-left transition hover:-translate-y-0.5"
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

        <section ref={aboutRef} id="about" className="relative">
          {renderSectionPanel('about')}
        </section>
        <section ref={activitiesRef} id="activities" className="relative">
          {renderSectionPanel('activities')}
        </section>
        <section ref={projectsRef} id="projects" className="relative">
          {renderSectionPanel('projects')}
        </section>
        <section ref={recruitRef} id="recruit" className="relative">
          {renderSectionPanel('recruit')}
        </section>
      </main>
    </div>
  )
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function PageShell({ children, wide = false, full = false, transition = true }) {
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
