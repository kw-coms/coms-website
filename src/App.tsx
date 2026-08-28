import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listFonts } from './services/fontApi'
import { BUILT_IN_FONTS, buildFontFaceCss, fontFamilyValue, injectBuiltinFontStylesheets } from './services/fontPreferences'
import { useAuth } from './contexts/useAuth'
import PageFallback from './components/home/PageFallback'
import { ToastHost } from './components/common/Toast'
import { ConfirmHost } from './components/common/ConfirmDialog'
import RouteErrorBoundary from './components/common/RouteErrorBoundary'
import {
  ACCENT_COLOR_KEY,
  FONT_SELECTION_KEY,
  THEME_MODE_KEY,
  getStoredAccentColor,
  getStoredFontId,
  getStoredThemeMode,
  mixHex,
  normalizeHex,
} from './utils/themeColors'
import { ScrollToTop, RequireAuth, RequireAdmin } from './routes/guards'
import {
  LoginPage,
  SignupPage,
  NoticesPage,
  ArchivePage,
  CommunityPage,
  CommunityBookmarksPage,
  CommunityMemberProfilePage,
  AdminPage,
  SettingsPage,
  RecruitPage,
  RecruitNoticePage,
} from './routes/pageWrappers'
import GlobalNavigation from './components/GlobalNavigation'
import AppearanceControl from './components/AppearanceControl'
import NotFoundPage from './components/NotFoundPage'
import HomeView from './pages/home/HomeView'
// Detail pages pull in the heavy activity-log / club-event / calendar sections.
// They are not the landing route, so lazy-load them out of the main bundle
// (App already wraps <Routes> in <Suspense fallback={<PageFallback />}>).
const AboutPage = lazy(() => import('./pages/home/detailPages').then((m) => ({ default: m.AboutPage })))
const ActivitiesDetailPage = lazy(() => import('./pages/home/detailPages').then((m) => ({ default: m.ActivitiesDetailPage })))
const ActivityLogPage = lazy(() => import('./pages/home/detailPages').then((m) => ({ default: m.ActivityLogPage })))
const ClubEventPage = lazy(() => import('./pages/home/detailPages').then((m) => ({ default: m.ClubEventPage })))
const MonthlyCalendarPage = lazy(() => import('./pages/home/detailPages').then((m) => ({ default: m.MonthlyCalendarPage })))
const AppsPage = lazy(() => import('./pages/home/detailPages').then((m) => ({ default: m.AppsPage })))
const ProjectsDetailPage = lazy(() => import('./pages/home/detailPages').then((m) => ({ default: m.ProjectsDetailPage })))

const ComsIntro = lazy(() => import('./components/common/ComsIntro'))

const FONTS_QUERY_KEY = ['app-shell', 'fonts']

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
    // Site default is Pretendard (BUILT_IN_FONTS[0]) — the bare system stack
    // only ever showed on Windows as Malgun Gothic. A user's explicit pick
    // still overrides; stylesheets are already injected above.
    const applied = selectedFont ?? BUILT_IN_FONTS[0]
    root.style.setProperty('--apple-font-family', fontFamilyValue(applied))
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
      <RouteErrorBoundary>
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
      </RouteErrorBoundary>
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
      <ConfirmHost />
    </Suspense>
  )
}

export default App
