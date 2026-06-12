import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import {
  Binary,
  Bell,
  Check,
  CircuitBoard,
  LogOut,
  Menu,
  Megaphone,
  Moon,
  Rocket,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { listNotices } from './services/noticeApi.js'
import { getNotificationSummary, listNotifications, markAllNotificationsRead, markNotificationRead } from './services/notificationApi.js'
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
import { useAuth } from './contexts/useAuth.js'

const tabs = [
  { id: 'about', label: 'About', hint: '정체성', icon: Binary, accent: 'text-cyan-200' },
  { id: 'activities', label: 'Activities', hint: '세미나·스터디', icon: Sparkles, accent: 'text-rose-200' },
  { id: 'projects', label: 'Projects', hint: '실전 제작', icon: CircuitBoard, accent: 'text-violet-200' },
  { id: 'recruit', label: 'Recruit', hint: '지원 안내', icon: Rocket, accent: 'text-sky-500' },
]

const activities = [
  '정기 세미나: 프로그래밍, 웹 개발, 알고리즘, 컴퓨터 기초 주제 진행',
  '스터디: 신입 부원부터 기존 부원까지 참여 가능한 수준별 운영',
  '프로젝트: 웹사이트, 앱, 아두이노, 소프트웨어 개발 팀 제작',
  '교류 활동: 선후배 간 경험 공유와 진로·학습 정보 교환',
]

const activityDetails = [
  {
    title: '정기 세미나',
    description: '프로그래밍 기초, 웹 개발, 알고리즘, 컴퓨터 구조처럼 학기 중 꾸준히 다루기 좋은 주제를 정해 함께 학습합니다.',
  },
  {
    title: '수준별 스터디',
    description: '처음 시작하는 부원은 기초 문법과 개발 환경부터 익히고, 기존 부원은 관심 분야별로 심화 스터디를 운영합니다.',
  },
  {
    title: '팀 프로젝트',
    description: '웹사이트, 앱, 아두이노, 자동화 도구 등 실제로 사용할 수 있는 결과물을 목표로 기획부터 구현까지 경험합니다.',
  },
  {
    title: '선후배 교류',
    description: '수강 과목, 공모전, 진로, 개발 학습 방법에 대한 경험을 공유하며 서로의 성장을 돕는 커뮤니티를 만듭니다.',
  },
]

const projects = [
  'COM\'s Official Website - React · Vite · Tailwind CSS 기반 공식 웹사이트',
  'Arduino Basic Class - 초급자를 위한 아두이노 기초 교육 프로젝트',
  'Web Development Study - HTML · CSS · JavaScript · React 학습 스터디',
]

const projectDetails = [
  {
    title: 'COM\'s Official Website',
    description: '동아리 소개, 공지사항, 자료실, 커뮤니티를 담는 공식 웹사이트입니다. React, Vite, Tailwind CSS를 활용해 실제 서비스 형태로 개발합니다.',
  },
  {
    title: 'Arduino Basic Class',
    description: '아두이노를 처음 접하는 부원을 위해 회로 연결, 센서 입력, 간단한 제어 로직을 단계별로 익히는 교육형 프로젝트입니다.',
  },
  {
    title: 'Web Development Study',
    description: 'HTML, CSS, JavaScript, React를 기반으로 화면 설계와 컴포넌트 구현을 연습하고, 작은 기능을 직접 완성해 봅니다.',
  },
  {
    title: '자유 주제 제작',
    description: '부원들이 관심 있는 아이디어를 팀으로 발전시켜 웹 서비스, 앱, 자동화 프로그램, 학습 도구 등 다양한 결과물을 제작합니다.',
  },
]

const heroHighlights = [
  { label: 'Weekly', value: 'Seminar', detail: '기초와 심화가 이어지는 학습 루틴' },
  { label: 'Team', value: 'Project', detail: '아이디어를 실제 서비스로 제작' },
  { label: 'Campus', value: 'Network', detail: '선후배가 함께 나누는 개발 경험' },
]

const experiencePills = ['Beginner friendly', 'React · Vite', 'Arduino', 'Study archive', 'Community']

const showcaseItems = [
  {
    eyebrow: 'Learn',
    title: '학습 흐름을 한눈에.',
    body: '정기 세미나, 수준별 스터디, 자료실이 하나의 흐름으로 이어집니다.',
    target: 'activities',
  },
  {
    eyebrow: 'Build',
    title: '만들면서 성장.',
    body: '웹사이트와 교육 프로젝트를 통해 실제로 쓰이는 결과물을 완성합니다.',
    target: 'projects',
  },
  {
    eyebrow: 'Join',
    title: '처음이어도 괜찮게.',
    body: '개발 경험이 적어도 함께 따라올 수 있는 활동 구조를 만듭니다.',
    target: 'recruit',
  },
]

const sectionMetrics = {
  about: [
    { value: 'Central', label: '광운대 중앙 동아리' },
    { value: 'Build', label: '팀 제작 중심 활동' },
    { value: 'Share', label: '선후배 경험 공유' },
  ],
  activities: [
    { value: '01', label: '기초 세미나' },
    { value: '02', label: '수준별 스터디' },
    { value: '03', label: '팀 프로젝트' },
  ],
  projects: [
    { value: 'Web', label: '공식 웹사이트' },
    { value: 'IoT', label: '아두이노 교육' },
    { value: 'App', label: '자유 제작' },
  ],
  recruit: [
    { value: 'Step 1', label: '지원서 작성' },
    { value: 'Step 2', label: '내부 확인' },
    { value: 'Step 3', label: '정기 활동' },
  ],
}

const visualDetails = {
  about: {
    title: 'Club OS',
    subtitle: 'Study · Build · Share',
    rows: ['학습 로드맵', '프로젝트 트랙', '커뮤니티 로그'],
    accent: 'var(--app-accent)',
  },
  activities: {
    title: 'Learning Stack',
    subtitle: 'Seminar · Study · Review',
    rows: ['기초 세미나', '분야별 스터디', '코드 리뷰'],
    accent: 'var(--app-accent)',
  },
  projects: {
    title: 'Project Lab',
    subtitle: 'Prototype · Launch · Iterate',
    rows: ['서비스 기획', '프론트엔드 구현', '배포와 개선'],
    accent: 'var(--app-accent)',
  },
  recruit: {
    title: 'Join Flow',
    subtitle: 'Apply · Meet · Start',
    rows: ['지원서 제출', '개별 안내', '오리엔테이션'],
    accent: 'var(--app-accent)',
  },
}

const sectionMeta = {
  about: {
    eyebrow: 'About COM\'s',
    background: '#ffffff',
    visual: 'linear-gradient(135deg, #e8f8ff, #f5f5f7 55%, #ffffff)',
  },
  activities: {
    eyebrow: 'Activities',
    background: '#f5f5f7',
    visual: 'linear-gradient(135deg, #fff1f4, #eef5ff)',
  },
  projects: {
    eyebrow: 'Projects',
    background: '#ffffff',
    visual: 'linear-gradient(135deg, #edf2ff, #f7f0ff)',
  },
  recruit: {
    eyebrow: 'Recruit',
    background: '#f5f5f7',
    visual: 'linear-gradient(135deg, #e8f3ff, #f5f5f7 60%, #ffffff)',
  },
}

const sectionStories = {
  about: {
    title: '광운대에서 컴퓨터를 가장 자연스럽게 시작하는 곳.',
    body: 'COM\'s는 세미나, 스터디, 프로젝트, 커뮤니티가 하나의 흐름으로 이어지는 중앙 컴퓨터 학술동아리입니다. 처음 배우는 사람도, 이미 만들고 있는 사람도 각자의 속도로 합류할 수 있습니다.',
    primary: 'About 더 알아보기',
    secondary: '활동 보기',
  },
  activities: {
    title: '기초부터 실전까지, 매주 이어지는 학습 루틴.',
    body: '정기 세미나와 수준별 스터디로 기초를 쌓고, 코드 리뷰와 작은 제작 과제로 배운 내용을 바로 손에 익힙니다.',
    primary: '활동 더 보기',
    secondary: '프로젝트 보기',
  },
  projects: {
    title: '아이디어를 실제 서비스와 제작물로.',
    body: '공식 웹사이트, 아두이노 교육, 웹 개발 스터디처럼 동아리 안에서 쓰이고 남는 결과물을 함께 설계하고 배포합니다.',
    primary: '프로젝트 더 보기',
    secondary: 'GitHub 열기',
  },
  recruit: {
    title: '함께 배울 다음 멤버를 기다립니다.',
    body: '전공이나 개발 경험보다 중요한 것은 꾸준히 배우고 만들어 보려는 마음입니다. 지원서는 로그인 없이 제출할 수 있고, 운영진 확인 후 개별 안내가 진행됩니다.',
    primary: '지원서 작성하기',
    secondary: '모집 공지 보기',
  },
}

const floatingBarBaseClass = 'apple-topbar border-b border-black/10'
const solidActionBtnClass = 'apple-action-primary inline-flex min-h-10 items-center justify-center px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60'
const ghostActionBtnClass = 'apple-action-secondary inline-flex min-h-10 items-center justify-center px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60'

const aboutDetailCards = [
  {
    title: 'Study',
    eyebrow: '기초에서 확장까지',
    body: '처음 배우는 사람도 따라올 수 있도록 정기 세미나와 스터디를 운영하고, 각자의 속도에 맞춰 실습과 리뷰를 이어갑니다.',
    icon: Binary,
  },
  {
    title: 'Build',
    eyebrow: '아이디어를 실제 결과물로',
    body: '웹, 임베디드, 자동화, 동아리 서비스처럼 손에 잡히는 프로젝트를 기획하고 직접 구현합니다.',
    icon: CircuitBoard,
  },
  {
    title: 'Share',
    eyebrow: '경험이 다음 사람에게',
    body: '선후배가 배운 것과 시행착오를 공유하면서 커뮤니티 안에 오래 남는 학습 기록을 만듭니다.',
    icon: Sparkles,
  },
]

const aboutDetailFlow = [
  ['01', 'Learn together', '세미나와 스터디로 개발의 기본기를 함께 쌓습니다.'],
  ['02', 'Make it real', '작은 실습을 프로젝트로 확장하며 결과물을 완성합니다.'],
  ['03', 'Grow the community', '후기, 코드 리뷰, 자료 공유로 다음 활동의 기준을 높입니다.'],
]

const aboutDetailPrinciples = [
  '처음 시작하는 사람도 편하게 질문할 수 있는 분위기',
  '작게 만들고 빠르게 공유하며 개선하는 제작 문화',
  '동아리 밖에서도 이어지는 개발 경험과 포트폴리오',
]

const DEFAULT_ACCENT = '#0071e3'
const THEME_MODE_KEY = 'kwcoms-theme-mode'
const ACCENT_COLOR_KEY = 'kwcoms-accent-color'
const accentSwatches = [
  { name: 'Apple Blue', value: '#0071e3' },
  { name: 'Graphite', value: '#3c3c43' },
  { name: 'Rose', value: '#d70015' },
  { name: 'Amber', value: '#ff9f0a' },
  { name: 'Violet', value: '#8e5cf7' },
]

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

// ─── Auth guards ───────────────────────────────────────────────────────────

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-black/10 bg-white/82 p-8 text-center text-[#6e6e73] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
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
      <div className="rounded-lg border border-black/10 bg-white/82 p-8 text-center text-[#6e6e73] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
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
      <button type="button" onClick={() => navigate('/login')} className="mb-6 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-white">
        로그인으로 돌아가기
      </button>
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
    <PageShell wide>
      <RecruitApply onBack={() => navigate('/')} />
    </PageShell>
  )
}

function RecruitNoticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'

  return (
    <PageShell wide full>
      <RecruitNotice onBack={() => navigate(from, { replace: true })} onApply={() => navigate('/recruit')} />
    </PageShell>
  )
}

function NotificationButton({ alignLeft = false, padded = false }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState({})
  const btnRef = useRef(null)
  const dropdownRef = useRef(null)
  const effectiveOpen = open && Boolean(user)

  const load = async () => {
    if (!user) return
    try {
      const [list, summary] = await Promise.all([listNotifications(), getNotificationSummary()])
      setItems(Array.isArray(list) ? list : [])
      setUnreadCount(summary?.unreadCount || 0)
    } catch {
      setItems([])
      setUnreadCount(0)
    }
  }

  useEffect(() => {
    if (!user) return
    let mounted = true
    Promise.all([listNotifications(), getNotificationSummary()])
      .then(([list, summary]) => {
        if (!mounted) return
        setItems(Array.isArray(list) ? list : [])
        setUnreadCount(summary?.unreadCount || 0)
      })
      .catch(() => {
        if (!mounted) return
        setItems([])
        setUnreadCount(0)
      })
    return () => { mounted = false }
  }, [user])

  const openNotification = async (item) => {
    try {
      await markNotificationRead(item.id)
      setUnreadCount((count) => Math.max(0, count - (item.read ? 0 : 1)))
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
    } catch {
      // Navigation should still work if the read marker fails.
    }
    setOpen(false)
    if (item.noticeId) {
      navigate(`/notices/${item.noticeId}`)
    } else if (item.postId) {
      navigate(`/community/${item.postId}${item.commentId ? `#comment-${item.commentId}` : ''}`)
    }
  }

  const readAll = async () => {
    await markAllNotificationsRead()
    setUnreadCount(0)
    setItems((prev) => prev.map((item) => ({ ...item, read: true })))
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
    load()
  }

  if (!user) return null

  return (
    <div className={padded ? 'px-5' : ''}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="relative inline-flex size-8 items-center justify-center rounded-full text-[var(--theme-body-dark)] transition hover:bg-black/5"
        aria-label="notifications"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {effectiveOpen && createPortal(
        <div
          ref={dropdownRef}
          className="theme-popover fixed z-[9999] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-black/10 bg-white text-[var(--theme-body-dark)] shadow-2xl"
          style={dropdownStyle}
        >
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
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
                className={`block w-full border-b border-black/8 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-black/5 ${item.read ? 'bg-white' : 'bg-cyan-50'}`}
              >
                <span className="block font-semibold">{item.message}</span>
                <span className="mt-1 block text-[11px] text-[var(--theme-body-muted)]">{new Date(item.createdAt).toLocaleString('ko-KR')}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function AppearanceControl({ accentColor, setAccentColor, themeMode, setThemeMode }) {
  const accent = normalizeHex(accentColor)
  const isDark = themeMode === 'dark'

  return (
    <section className="appearance-control border-t border-black/10 bg-[var(--app-surface-soft)] px-5 py-8 text-[var(--app-text)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-lg border border-black/10 bg-white/88 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">Appearance</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">화면 설정</h2>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <button
            type="button"
            onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--app-text)] px-5 text-sm font-semibold text-[var(--app-bg)] transition hover:opacity-90"
            aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            {isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-[var(--app-muted)]">색상</span>
            {accentSwatches.map((swatch) => {
              const active = accent === swatch.value
              return (
                <button
                  key={swatch.value}
                  type="button"
                  onClick={() => setAccentColor(swatch.value)}
                  className={`relative flex size-8 items-center justify-center rounded-full border transition ${active ? 'border-[var(--app-text)]' : 'border-black/10 hover:scale-105'}`}
                  style={{ backgroundColor: swatch.value }}
                  aria-label={`${swatch.name} 색상 선택`}
                  title={swatch.name}
                >
                  {active && <Check size={15} className="text-white drop-shadow" />}
                </button>
              )
            })}
            <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)]">
              직접 선택
              <input
                type="color"
                value={accent}
                onChange={(event) => setAccentColor(event.target.value)}
                className="h-5 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label="커스텀 색상 선택"
              />
            </label>
            <button
              type="button"
              onClick={() => setAccentColor(DEFAULT_ACCENT)}
              className="min-h-8 rounded-full border border-black/10 bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-black/10 border-t-[var(--app-accent)]" />
    </div>
  )
}

function App() {
  const [themeMode, setThemeMode] = useState(getStoredThemeMode)
  const [accentColor, setAccentColor] = useState(getStoredAccentColor)

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

  return (
    <Suspense fallback={<PageFallback />}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/notices" element={<NoticesPage />} />
        <Route path="/notices/:id" element={<NoticesPage />} />
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
      />
    </Suspense>
  )
}

// ─── Home page ──────────────────────────────────────────────────────────────

function AboutPage() {
  const navigate = useNavigate()

  const goHomeSection = (id) => {
    navigate(`/#${id}`)
    window.setTimeout(() => {
      const target = document.getElementById(id)
      if (target) {
        const rect = target.getBoundingClientRect()
        window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - 54), behavior: 'smooth' })
      }
    }, 80)
  }

  return (
    <div className="theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <header className="fixed inset-x-0 top-0 z-60">
        <div className={`${floatingBarBaseClass} mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8`}>
          <button type="button" onClick={() => navigate('/')} className="flex min-w-0 items-center gap-3 text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="h-6 w-6 shrink-0 object-contain" />
            <span className="whitespace-nowrap text-sm font-semibold text-[#1d1d1f]">KW COM&apos;s</span>
          </button>
          <button type="button" onClick={() => navigate('/')} className="rounded-full px-4 py-1.5 text-xs font-semibold text-[#1d1d1f]/78 transition hover:bg-black/5 hover:text-[#1d1d1f]">
            Home
          </button>
        </div>
      </header>

      <main className="relative overflow-hidden pt-[44px]">
        <section className="relative grid min-h-[calc(92svh-44px)] items-center gap-12 overflow-hidden bg-[#f5f5f7] px-5 py-16 lg:grid-cols-[1fr_0.92fr] lg:px-12">
          <div className="home-hero-surface absolute inset-0" />
          <div className="relative z-10 mx-auto max-w-3xl text-center lg:text-left">
            <p className="apple-eyebrow">About COM&apos;s</p>
            <h1 className="apple-display mt-4 text-6xl sm:text-7xl lg:text-[7.5rem]">
              함께 배우고, 바로 만듭니다.
            </h1>
            <p className="apple-copy mt-6 text-xl sm:text-2xl">
              COM&apos;s는 광운대학교 학생들이 컴퓨터와 소프트웨어를 함께 공부하고, 실제 프로젝트로 연결하는 중앙 컴퓨터 학술동아리입니다.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <button type="button" onClick={() => navigate('/')} className={solidActionBtnClass}>홈으로 돌아가기</button>
              <button type="button" onClick={() => goHomeSection('activities')} className={ghostActionBtnClass}>활동 보기</button>
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-xl">
            <div className="rounded-lg bg-white/82 p-5 shadow-[0_32px_90px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-2xl">
              <div className="mb-8 flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#ffbd2e]" />
                <span className="size-3 rounded-full bg-[#0071e3]" />
              </div>
              <div className="mx-auto flex aspect-square max-w-[18rem] items-center justify-center rounded-[2.2rem] bg-[#f5f5f7] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="w-[58%] object-contain" />
              </div>
              <div className="mt-8 grid gap-3">
                {aboutDetailFlow.map(([number, title]) => (
                  <div key={number} className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.05)]">
                    <span className="size-2.5 rounded-full bg-[var(--app-accent)]" />
                    <span>{title}</span>
                    <span className="ml-auto text-xs text-[#86868b]">{number}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="apple-eyebrow">What we do</p>
              <h2 className="apple-display mt-4 text-5xl sm:text-6xl">배움이 결과물로 이어지도록.</h2>
            </div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {aboutDetailCards.map(({ title, eyebrow, body, icon: Icon }) => (
                <article key={title} className="apple-product-panel min-h-[19rem] px-7 py-7">
                  <div className="mb-8 inline-flex size-11 items-center justify-center rounded-full bg-[#f5f5f7] text-[#0066cc]">
                    <Icon size={20} />
                  </div>
                  <p className="apple-eyebrow">{eyebrow}</p>
                  <h3 className="mt-3 text-3xl font-semibold text-[#1d1d1f]">{title}</h3>
                  <p className="mt-4 text-[15px] font-medium leading-7 text-[#6e6e73]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f5f5f7] px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="apple-eyebrow text-center">Club flow</p>
            <h2 className="apple-display mx-auto mt-4 max-w-4xl text-center text-5xl sm:text-6xl">
              한 학기의 경험이 다음 학기의 기준이 됩니다.
            </h2>
            <div className="mt-12 grid gap-3">
              {aboutDetailFlow.map(([number, title, body]) => (
                <article key={number} className="grid gap-4 rounded-lg bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:grid-cols-[5rem_1fr] sm:items-center">
                  <span className="text-3xl font-semibold text-[#0066cc]">{number}</span>
                  <div>
                    <h3 className="text-2xl font-semibold text-[#1d1d1f]">{title}</h3>
                    <p className="mt-2 text-[15px] font-medium leading-7 text-[#6e6e73]">{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1fr] lg:items-center">
            <div>
              <p className="apple-eyebrow">Culture</p>
              <h2 className="apple-display mt-4 text-5xl sm:text-6xl">COM&apos;s가 오래 가져가는 태도.</h2>
              <p className="apple-copy mt-5 text-xl">
                잘하는 사람만 모이는 곳보다, 함께 성장하는 방식을 계속 만드는 곳을 지향합니다.
              </p>
            </div>
            <div className="grid gap-3">
              {aboutDetailPrinciples.map((item, index) => (
                <div key={item} className="flex items-center gap-4 rounded-lg bg-[#f5f5f7] px-5 py-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#0066cc]">{index + 1}</span>
                  <p className="text-lg font-semibold leading-7 text-[#1d1d1f]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function HomeView() {
  const { user, loading: authLoading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeSection, setActiveSection] = useState(null)
  const aboutRef = useRef(null)
  const activitiesRef = useRef(null)
  const projectsRef = useRef(null)
  const recruitRef = useRef(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [latestNotice, setLatestNotice] = useState(null)
  const [activitiesExpanded, setActivitiesExpanded] = useState(false)
  const [projectsExpanded, setProjectsExpanded] = useState(false)

  useEffect(() => {
    let rafId = null
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const sections = [
          { id: 'about', ref: aboutRef },
          { id: 'activities', ref: activitiesRef },
          { id: 'projects', ref: projectsRef },
          { id: 'recruit', ref: recruitRef },
        ]
        let found = false
        const centerY = window.innerHeight / 2
        for (const s of sections) {
          const sectionEl = s.ref.current
          if (!sectionEl) continue
          const panelEl = sectionEl.querySelector?.('[data-panel]') || sectionEl
          const rect = panelEl.getBoundingClientRect()
          const isCentered = rect.top <= centerY && rect.bottom >= centerY
          if (isCentered) {
            setActiveSection(s.id)
            found = true
            break
          }
        }
        if (!found && (window.scrollY || window.pageYOffset) < 140) setActiveSection(null)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    listNotices()
      .then((data) => {
        if (!mounted) return
        const notices = Array.isArray(data) ? data : []
        const general = notices.find((n) => (n.category || 'GENERAL') === 'GENERAL')
        if (general) setLatestNotice(general)
      })
      .catch((err) => console.warn('Failed to load latest notice', err))
    return () => { mounted = false }
  }, [])

  const openPanel = (id) => {
    const map = { about: aboutRef, activities: activitiesRef, projects: projectsRef, recruit: recruitRef }
    const ref = map[id]
    if (ref && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const targetY = Math.max(0, window.scrollY + rect.top - 54)
      window.scrollTo({ top: targetY, behavior: 'smooth' })
      setActiveSection(id)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goArchive = () => { if (!authLoading) navigate('/resources') }
  const goCommunity = () => { if (!authLoading) navigate('/community') }
  const goNotices = () => navigate('/notices')
  const goAdmin = () => navigate('/admin')
  const goChangePassword = () => navigate('/settings')
  const goRecruitPage = () => navigate('/recruit')
  const locationPath = () => `${location.pathname}${location.search}${location.hash}`

  const renderSectionContent = (id) => {
    const story = sectionStories[id]
    if (story) {
      const metrics = sectionMetrics[id]
      const detailItems = id === 'activities'
        ? (activitiesExpanded ? activityDetails : activityDetails.slice(0, 2))
        : id === 'projects'
          ? (projectsExpanded ? projectDetails : projectDetails.slice(0, 3))
          : []

      const primaryAction = () => {
        if (id === 'about') navigate('/about')
        if (id === 'activities') setActivitiesExpanded((open) => !open)
        if (id === 'projects') setProjectsExpanded((open) => !open)
        if (id === 'recruit') goRecruitPage()
      }

      const secondaryAction = () => {
        if (id === 'about') openPanel('activities')
        if (id === 'activities') openPanel('projects')
        if (id === 'recruit') navigate('/recruit-notice', { state: { from: `${locationPath()}#recruit` } })
      }

      return (
        <div className="mx-auto w-full max-w-5xl">
          <div className="mx-auto max-w-4xl text-center">
            <p className="apple-eyebrow">{sectionMeta[id].eyebrow}</p>
            <h2 className="apple-display mt-4 text-5xl sm:text-6xl lg:text-7xl">{story.title}</h2>
            <p className="apple-copy mx-auto mt-6 max-w-3xl text-xl sm:text-2xl">{story.body}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={primaryAction} className={solidActionBtnClass}>
                {id === 'activities' && activitiesExpanded ? '활동 요약 보기' : id === 'projects' && projectsExpanded ? '프로젝트 요약 보기' : story.primary}
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
                <p className="text-lg font-semibold text-[#1d1d1f]">{item.value}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#6e6e73]">{item.label}</p>
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
                  <h3 className="mt-3 text-2xl font-semibold leading-tight text-[#1d1d1f]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-6 text-[#6e6e73]">{item.body}</p>
                </button>
              ))}
            </div>
          )}

          {detailItems.length > 0 && (
            <div className={`mt-10 grid gap-3 ${id === 'projects' ? 'lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {detailItems.map((item, index) => (
                <article key={item.title} className="apple-product-panel px-6 py-6 text-left transition hover:-translate-y-0.5">
                  <div className="mb-5 inline-flex size-9 items-center justify-center rounded-full bg-[#f5f5f7] text-xs font-bold text-[#0066cc]">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h3 className="text-xl font-semibold text-[#1d1d1f]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-[#6e6e73]">{item.description}</p>
                </article>
              ))}
            </div>
          )}

          {id === 'activities' && activitiesExpanded && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {activities.map((item) => (
                <div key={item} className="rounded-lg bg-[#1d1d1f] px-5 py-4 text-sm font-semibold leading-6 text-white">
                  {item}
                </div>
              ))}
            </div>
          )}

          {id === 'projects' && projectsExpanded && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {projects.map((item) => (
                <div key={item} className="apple-soft-panel px-5 py-4 text-sm font-semibold leading-6 text-[#1d1d1f]">
                  {item}
                </div>
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
        <div className="mx-auto grid min-h-[calc(100svh-44px)] max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.75fr)] lg:px-10">
          <div className="flex items-center">
            {renderSectionContent(id)}
          </div>
          <div className="flex items-center justify-center">
            <div className="home-device relative aspect-square w-full max-w-md overflow-hidden rounded-lg ring-1 ring-black/5" style={{ background: meta.visual }}>
              <div className="absolute inset-0 bg-linear-to-b from-white/30 via-transparent to-black/5" />
              <div className="absolute inset-x-6 top-6 rounded-lg bg-white/78 px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
                  <span className="size-2.5 rounded-full bg-[#0071e3]" />
                </div>
                <p className="text-2xl font-semibold text-[#1d1d1f]">{visual.title}</p>
                <p className="mt-1 text-sm font-semibold text-[#6e6e73]">{visual.subtitle}</p>
              </div>
              <div className="absolute left-1/2 top-1/2 flex size-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2rem] bg-white/72 shadow-[0_24px_70px_rgba(0,0,0,0.12)] backdrop-blur-md sm:size-40">
                <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="home-logo-float w-[68%] object-contain" />
              </div>
              <div className="absolute bottom-6 left-6 right-6 space-y-2">
                {visual.rows.map((row, index) => (
                  <div key={row} className="flex items-center gap-3 rounded-lg bg-white/76 px-4 py-3 text-sm font-semibold text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: visual.accent }} />
                    <span>{row}</span>
                    <span className="ml-auto text-xs text-[#86868b]">{String(index + 1).padStart(2, '0')}</span>
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

      <header className="fixed inset-x-0 top-0 z-60">
        <div className={`${floatingBarBaseClass} relative mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8`}>
          <button type="button" onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex min-w-0 items-center gap-3 text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="h-6 w-6 shrink-0 object-contain" />
            <div className="min-w-0">
              <h1 className="whitespace-nowrap text-sm font-semibold text-[#1d1d1f]">KW COM&apos;s</h1>
            </div>
          </button>

          <nav className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-6 md:flex">
            {tabs.map((tab) => {
              const active = activeSection === tab.id
              return (
                <button key={tab.id} type="button" onClick={() => openPanel(tab.id)} className={`relative px-1 text-xs font-semibold transition ${active ? 'text-[#1d1d1f]' : 'text-[#1d1d1f]/72 hover:text-[#1d1d1f]'}`}>
                  {tab.label}
                  <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${active ? 'opacity-100' : 'opacity-0'}`} />
                </button>
              )
            })}
            <button type="button" onClick={goNotices} className="px-1 text-xs font-semibold text-[#1d1d1f]/78 transition hover:text-[#1d1d1f]">Notices</button>
            <button type="button" onClick={goArchive} disabled={authLoading} className="px-1 text-xs font-semibold text-[#1d1d1f]/78 transition hover:text-[#1d1d1f] disabled:cursor-wait disabled:opacity-60">Resources</button>
            <button type="button" onClick={goCommunity} disabled={authLoading} className="px-1 text-xs font-semibold text-[#1d1d1f]/78 transition hover:text-[#1d1d1f] disabled:cursor-wait disabled:opacity-60">Community</button>
          </nav>

          {user ? (
            <div className="ml-auto hidden items-center gap-1 md:flex">
              <NotificationButton />
              <button type="button" onClick={goChangePassword} className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#1d1d1f]/78 transition hover:bg-black/5 hover:text-[#1d1d1f]" title="계정 설정">{user.name}</button>
              {user.role === 'ADMIN' && (
                <button type="button" onClick={goAdmin} className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#b45309] transition hover:bg-amber-100/70">관리자</button>
              )}
              <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-[#1d1d1f]/78 transition hover:bg-black/5 hover:text-[#1d1d1f]">
                <LogOut size={14} />
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login')}
              disabled={authLoading}
              className="ml-auto hidden shrink-0 whitespace-nowrap rounded-full bg-[var(--app-accent)] px-4 py-1 text-xs font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-wait disabled:opacity-70 md:inline-flex"
            >
              로그인
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="fixed right-4 top-1.5 z-[70] flex shrink-0 items-center justify-center rounded-full p-2 text-[#1d1d1f] transition hover:bg-black/5 md:hidden"
            aria-label="메뉴"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-haspopup="menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div
            id="mobile-menu"
            role="menu"
            className="mx-auto border-b border-black/10 bg-white/95 shadow-[0_12px_28px_rgba(0,0,0,0.08)] backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col divide-y divide-black/8">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => { openPanel(tab.id); setMobileMenuOpen(false) }} className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/60">
                  <tab.icon size={15} className={tab.accent} />
                  <span>{tab.label}</span>
                  <span className="ml-auto text-xs text-[var(--theme-body-muted)]">{tab.hint}</span>
                </button>
              ))}
              <button type="button" onClick={() => { goNotices(); setMobileMenuOpen(false) }} className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/60">
                <Megaphone size={15} className="text-cyan-500" />
                <span>Notices</span>
                <span className="ml-auto text-xs text-[var(--theme-body-muted)]">공지사항</span>
              </button>
              <button type="button" onClick={() => { goArchive(); setMobileMenuOpen(false) }} disabled={authLoading} className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/60 disabled:opacity-50">
                <CircuitBoard size={15} className="text-violet-400" />
                <span>Resources</span>
                <span className="ml-auto text-xs text-[var(--theme-body-muted)]">자료실</span>
              </button>
              <button type="button" onClick={() => { goCommunity(); setMobileMenuOpen(false) }} disabled={authLoading} className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/60 disabled:opacity-50">
                <Sparkles size={15} className="text-rose-400" />
                <span>Community</span>
                <span className="ml-auto text-xs text-[var(--theme-body-muted)]">커뮤니티</span>
              </button>
              {!user && (
                <button type="button" onClick={() => { navigate('/login'); setMobileMenuOpen(false) }} disabled={authLoading} className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[#0066cc] transition hover:bg-white/60 disabled:opacity-50">
                  <span>로그인</span>
                </button>
              )}
              {user && (
                <div className="border-t border-black/10">
                  <div className="flex flex-col divide-y divide-black/8">
                    <button type="button" onClick={() => { goChangePassword(); setMobileMenuOpen(false) }} className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/60">
                      <span className="size-5 flex items-center justify-center rounded-full bg-black/10 text-[10px] font-black">{user.name?.[0] ?? '?'}</span>
                      <span>{user.name}</span>
                      <span className="ml-auto text-xs text-[var(--theme-body-muted)]">계정 설정</span>
                    </button>
                    {user.role === 'ADMIN' && (
                      <button type="button" onClick={() => { goAdmin(); setMobileMenuOpen(false) }} className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50/60">
                        <span className="text-sm">⚙</span>
                        <span>관리자 패널</span>
                      </button>
                    )}
                    <div className="py-3.5">
                      <NotificationButton alignLeft padded />
                    </div>
                    <button type="button" onClick={() => { handleLogout(); setMobileMenuOpen(false) }} className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/60">
                      <LogOut size={15} />
                      <span>로그아웃</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="relative overflow-hidden pt-[44px]">
        <section className="relative flex min-h-[calc(86svh-44px)] items-center justify-center overflow-hidden bg-[#f5f5f7] px-5 py-12 text-center sm:min-h-[calc(92svh-44px)] sm:py-14">
          <div className="home-hero-surface absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-b from-transparent to-white/85" />
          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/76 px-4 py-2 text-xs font-semibold text-[#6e6e73] shadow-[0_6px_22px_rgba(0,0,0,0.06)] backdrop-blur-xl">
              <span className="size-2 rounded-full bg-[var(--app-accent)]" />
              2026 Semester Ready
            </div>
            <div className="relative mx-auto mt-8 flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
              <div className="absolute inset-0 rounded-[2rem] bg-white/88 shadow-[0_24px_70px_rgba(0,0,0,0.1)] ring-1 ring-black/5" />
              <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="home-logo-float relative z-10 h-24 w-24 object-contain sm:h-32 sm:w-32" />
              <div className="absolute -left-28 top-8 hidden rounded-lg bg-white/82 px-4 py-3 text-left shadow-[0_16px_40px_rgba(0,0,0,0.09)] backdrop-blur-xl sm:block">
                <p className="text-xs font-semibold text-[#86868b]">Track</p>
                <p className="mt-1 text-sm font-semibold text-[#1d1d1f]">Study to Project</p>
              </div>
              <div className="absolute -right-28 bottom-8 hidden rounded-lg bg-[#1d1d1f] px-4 py-3 text-left text-white shadow-[0_16px_40px_rgba(0,0,0,0.18)] sm:block">
                <p className="text-xs font-semibold text-white/58">Mode</p>
                <p className="mt-1 text-sm font-semibold">Build together</p>
              </div>
            </div>
            <p className="mt-7 text-sm font-semibold text-[#6e6e73]">Kwangwoon University Computer Club</p>
            <h2 className="apple-display mt-2 text-6xl sm:text-8xl lg:text-[8.5rem]">
              KW COM&apos;s
            </h2>
            <p className="apple-copy mx-auto mt-6 max-w-[19rem] text-lg sm:max-w-3xl sm:text-2xl">
              배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => openPanel('about')} className={solidActionBtnClass}>더 알아보기</button>
              <button type="button" onClick={goRecruitPage} className={ghostActionBtnClass}>지원하기</button>
            </div>
            {latestNotice && (
              <button type="button" onClick={goNotices} className="mx-auto mt-7 flex max-w-md items-center gap-2 rounded-full bg-white px-4 py-2 text-left shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition hover:shadow-[0_5px_18px_rgba(0,0,0,0.12)]">
                <Megaphone size={14} className="shrink-0 text-[var(--app-accent-text)]" />
                <span className="truncate text-xs font-semibold text-[#1d1d1f]">{latestNotice.title}</span>
                <span className="ml-auto shrink-0 text-[10px] font-bold uppercase text-[#0066cc]">공지</span>
              </button>
            )}
            <div className="mx-auto mt-8 flex max-w-[21rem] flex-wrap justify-center gap-2 sm:max-w-3xl">
              {experiencePills.map((pill) => (
                <span key={pill} className="rounded-full bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-[#6e6e73] shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:px-3 sm:text-xs">
                  {pill}
                </span>
              ))}
            </div>
            <div className="mx-auto mt-10 hidden max-w-5xl gap-3 sm:grid sm:grid-cols-3">
              {heroHighlights.map((item) => (
                <div key={item.value} className="rounded-lg bg-white px-5 py-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(0,0,0,0.08)]">
                  <p className="text-xs font-semibold text-[#86868b]">{item.label}</p>
                  <p className="mt-2 text-xl font-semibold text-[#1d1d1f]">{item.value}</p>
                  <p className="mt-1 text-sm leading-6 text-[#6e6e73]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-3 sm:py-5">
          <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-3">
            {showcaseItems.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => openPanel(item.target)}
                className={`apple-product-panel group min-h-[13.5rem] px-7 py-7 text-left transition hover:-translate-y-0.5 ${index === 0 ? 'bg-[#1d1d1f] text-white' : index === 1 ? 'bg-[#f5f5f7] text-[#1d1d1f]' : 'bg-linear-to-br from-[#e8f8ff] to-[#ffffff] text-[#1d1d1f]'}`}
              >
                <p className={`text-sm font-semibold ${index === 0 ? 'text-white/58' : 'text-[#0066cc]'}`}>{item.eyebrow}</p>
                <h3 className="mt-3 text-3xl font-semibold leading-tight tracking-normal">{item.title}</h3>
                <p className={`mt-4 max-w-sm leading-7 ${index === 0 ? 'text-white/70' : 'text-[#6e6e73]'}`}>{item.body}</p>
                <span className={`mt-8 inline-flex rounded-full px-4 py-2 text-sm font-semibold ${index === 0 ? 'bg-white text-[#1d1d1f]' : 'bg-[#0071e3] text-white'}`}>더 보기</span>
              </button>
            ))}
          </div>
        </section>

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

        <footer className="border-t border-black/10 bg-[#f5f5f7] px-5 py-10 text-sm text-[#6e6e73]">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p>Copyright © KW COM&apos;s. All rights reserved.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <a href="https://www.instagram.com/kw_coms" target="_blank" rel="noreferrer" className="hover:text-[#1d1d1f]">Instagram</a>
              <a href="https://github.com/kw-coms" target="_blank" rel="noreferrer" className="hover:text-[#1d1d1f]">GitHub</a>
              <a href="https://www.youtube.com/@kw_coms" target="_blank" rel="noreferrer" className="hover:text-[#1d1d1f]">YouTube</a>
              <a href="mailto:kwcoms69@gmail.com" className="hover:text-[#1d1d1f]">Mail</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function PageShell({ children, wide = false, full = false }) {
  return (
    <div className="apple-route relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white via-[#f5f5f7] to-white" />
      <div className="fixed right-4 top-4 z-50">
        <NotificationButton />
      </div>
      <main className={`relative mx-auto flex min-h-screen min-w-0 px-4 sm:px-6 ${full ? 'items-start pt-20 pb-16' : 'items-center justify-center py-24'} ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>
        <div className={`page-transition w-full min-w-0 ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>{children}</div>
      </main>
    </div>
  )
}

export default App
