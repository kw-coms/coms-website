import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import {
  Binary,
  CircuitBoard,
  Github,
  Instagram,
  LogOut,
  Mail,
  Menu,
  Megaphone,
  Rocket,
  Sparkles,
  X,
  Youtube,
} from 'lucide-react'
import { listNotices } from './services/noticeApi.js'
import SplitLogoCard from './components/common/SplitLogoCard.jsx'
import Archive from './pages/Archive.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Notices from './pages/Notices.jsx'
import Admin from './pages/Admin.jsx'
import Community from './pages/Community.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import { getLogoAsset } from './utils/logoAssets.js'
import FixedBrackets from './components/common/FixedBrackets.jsx'
import { useAuth } from './contexts/useAuth.js'
import { submitRecruitApplication } from './services/recruitApi.js'

const tabs = [
  { id: 'about', label: 'About', hint: '정체성', icon: Binary, accent: 'text-cyan-200' },
  { id: 'activities', label: 'Activities', hint: '세미나·스터디', icon: Sparkles, accent: 'text-rose-200' },
  { id: 'projects', label: 'Projects', hint: '실전 제작', icon: CircuitBoard, accent: 'text-violet-200' },
  { id: 'recruit', label: 'Recruit', hint: '지원 안내', icon: Rocket, accent: 'text-emerald-200' },
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

const sectionMeta = {
  about: {
    accent: 'text-cyan-100',
    glow: 'rgba(103, 232, 249, 0.22)',
    bracket: '#67e8f9',
    background: 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(14,165,233,0.92), rgba(34,211,238,0.84))',
  },
  activities: {
    accent: 'text-rose-100',
    glow: 'rgba(251, 113, 133, 0.22)',
    bracket: '#fda4af',
    background: 'linear-gradient(135deg, rgba(236,72,153,0.96), rgba(244,114,182,0.92), rgba(251,113,133,0.84))',
  },
  projects: {
    accent: 'text-violet-100',
    glow: 'rgba(196, 181, 253, 0.22)',
    bracket: '#c4b5fd',
    background: 'linear-gradient(135deg, rgba(124,58,237,0.96), rgba(168,85,247,0.92), rgba(139,92,246,0.84))',
  },
  recruit: {
    accent: 'text-emerald-100',
    glow: 'rgba(74, 222, 128, 0.22)',
    bracket: '#6ee7b7',
    background: 'linear-gradient(135deg, rgba(16,185,129,0.96), rgba(34,197,94,0.92), rgba(52,211,153,0.84))',
  },
}

const floatingBarBaseClass = 'shape-cut border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)]'
const solidActionBtnClass = 'shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:scale-[1.02]'
const ghostActionBtnClass = 'shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/20'

const recruitInitialForm = {
  name: '',
  studentId: '',
  department: '',
  grade: '',
  phone: '',
  email: '',
  interests: '',
  motivation: '',
  experience: '',
  expectedActivities: '',
}

// ─── Auth guards ───────────────────────────────────────────────────────────

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="shape-cut border border-white/10 bg-white/5 p-8 text-center text-white/70 backdrop-blur-md">
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
      <div className="shape-cut border border-white/10 bg-white/5 p-8 text-center text-white/70 backdrop-blur-md">
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
  const from = location.state?.from?.pathname || '/'
  return (
    <PageShell>
      <Login onBack={() => navigate(from)} goSignup={() => navigate('/signup')} />
    </PageShell>
  )
}

function SignupPage() {
  const navigate = useNavigate()
  return (
    <PageShell>
      <button type="button" onClick={() => navigate('/login')} className="shape-cut-sm mb-6 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/15">
        로그인으로 돌아가기
      </button>
      <Signup onBack={() => navigate('/login')} />
    </PageShell>
  )
}

function NoticesPage() {
  return (
    <PageShell>
      <Notices />
    </PageShell>
  )
}

function ArchivePage() {
  const navigate = useNavigate()
  return (
    <PageShell wide>
      <Archive onBack={() => navigate('/')} />
    </PageShell>
  )
}

function CommunityPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide>
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
  const location = useLocation()
  const [formOpen, setFormOpen] = useState(() => new URLSearchParams(location.search).get('apply') === '1')
  const [form, setForm] = useState(recruitInitialForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')

  useEffect(() => {
    if (new URLSearchParams(location.search).get('apply') === '1') {
      setFormOpen(true)
    }
  }, [location.search])

  const inputClass = 'w-full shape-cut-sm border border-white/10 bg-white/90 px-4 py-3 text-[15px] text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-emerald-300/55'
  const labelClass = 'mb-2 block text-sm font-semibold text-white/88'

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const validateRecruitForm = () => {
    if (!form.name.trim()) return '이름을 입력해주세요.'
    if (!/^\d{10}$/.test(form.studentId.trim())) return '학번은 숫자 10자리로 입력해주세요.'
    if (!form.department.trim()) return '학과를 입력해주세요.'
    if (!form.grade.trim()) return '학년을 입력해주세요.'
    if (!form.phone.trim()) return '전화번호를 입력해주세요.'
    if (!form.email.trim() || !form.email.includes('@')) return '올바른 이메일을 입력해주세요.'
    if (!form.interests.trim()) return '관심 분야를 입력해주세요.'
    if (!form.motivation.trim()) return '지원 동기를 입력해주세요.'
    if (!form.experience.trim()) return '관련 경험을 입력해주세요.'
    if (!form.expectedActivities.trim()) return '기대하는 활동을 입력해주세요.'
    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    setSubmitMessage('')

    const validationMessage = validateRecruitForm()
    if (validationMessage) {
      setSubmitError(validationMessage)
      return
    }

    setSubmitting(true)
    try {
      const result = await submitRecruitApplication({
        name: form.name.trim(),
        studentId: form.studentId.trim(),
        department: form.department.trim(),
        grade: form.grade.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        interests: form.interests.trim(),
        motivation: form.motivation.trim(),
        experience: form.experience.trim(),
        expectedActivities: form.expectedActivities.trim(),
      })
      setSubmitMessage(result.message || '지원서가 접수되었습니다.')
      setForm(recruitInitialForm)
    } catch (err) {
      setSubmitError(err.message || '지원서 제출 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <BackgroundLayers />
      <div className="relative mx-auto flex min-h-screen max-w-5xl items-center px-4 py-28 sm:px-6">
        <div className="w-full">
          <button type="button" onClick={() => navigate('/')} className="shape-cut-sm mb-6 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/15">
            메인으로 돌아가기
          </button>
          <section className="shape-cut border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200">Recruit</p>
            <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">COM&apos;s 지원하기</h1>
            <p className="mt-6 max-w-3xl leading-8 text-white/70">
              광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고, 만들고, 성장할 부원을 모집합니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={() => setFormOpen(true)} className={solidActionBtnClass}>
                지원서 작성하기
              </button>
              <button type="button" onClick={() => navigate('/notices')} className={ghostActionBtnClass}>
                모집 공지 보기
              </button>
            </div>
          </section>

          {formOpen && (
            <section className="shape-cut mt-6 border border-white/10 bg-white/7 p-6 backdrop-blur-md sm:p-8">
              <div className="mb-6">
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200">Application</p>
                <h2 className="mt-3 text-3xl font-semibold">COM&apos;s 지원서</h2>
              </div>

              <form onSubmit={handleSubmit} className="grid gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="recruit-name">이름</label>
                    <input id="recruit-name" name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="이름을 입력하세요" autoComplete="name" />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="recruit-student-id">학번</label>
                    <input id="recruit-student-id" name="studentId" value={form.studentId} onChange={handleChange} className={inputClass} placeholder="숫자 10자리" inputMode="numeric" autoComplete="username" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="recruit-department">학과</label>
                    <input id="recruit-department" name="department" value={form.department} onChange={handleChange} className={inputClass} placeholder="학과를 입력하세요" />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="recruit-grade">학년</label>
                    <input id="recruit-grade" name="grade" value={form.grade} onChange={handleChange} className={inputClass} placeholder="예: 1학년" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="recruit-phone">전화번호</label>
                    <input id="recruit-phone" name="phone" value={form.phone} onChange={handleChange} className={inputClass} placeholder="01012345678" autoComplete="tel" />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="recruit-email">이메일</label>
                    <input id="recruit-email" name="email" type="email" value={form.email} onChange={handleChange} className={inputClass} placeholder="답장 받을 이메일" autoComplete="email" />
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="recruit-interests">관심 분야</label>
                  <input id="recruit-interests" name="interests" value={form.interests} onChange={handleChange} className={inputClass} placeholder="예: 웹, 앱, 보안, 아두이노" />
                </div>

                <div>
                  <label className={labelClass} htmlFor="recruit-motivation">지원 동기</label>
                  <textarea id="recruit-motivation" name="motivation" value={form.motivation} onChange={handleChange} rows={4} maxLength={1000} className={`${inputClass} resize-none`} placeholder="COM's에 지원하게 된 이유를 적어주세요." />
                </div>

                <div>
                  <label className={labelClass} htmlFor="recruit-experience">관련 경험</label>
                  <textarea id="recruit-experience" name="experience" value={form.experience} onChange={handleChange} rows={4} maxLength={1000} className={`${inputClass} resize-none`} placeholder="프로그래밍, 프로젝트, 학습 경험 등을 자유롭게 적어주세요." />
                </div>

                <div>
                  <label className={labelClass} htmlFor="recruit-expected">기대하는 활동</label>
                  <textarea id="recruit-expected" name="expectedActivities" value={form.expectedActivities} onChange={handleChange} rows={4} maxLength={1000} className={`${inputClass} resize-none`} placeholder="동아리에서 해보고 싶은 활동을 적어주세요." />
                </div>

                {submitError && (
                  <p className="shape-cut-sm bg-red-400/12 px-4 py-3 text-sm font-semibold text-red-100">{submitError}</p>
                )}
                {submitMessage && (
                  <p className="shape-cut-sm bg-emerald-300/14 px-4 py-3 text-sm font-semibold text-emerald-100">{submitMessage}</p>
                )}

                <button type="submit" disabled={submitting} className="shape-cut-sm bg-[var(--theme-text)] px-5 py-3 text-base font-semibold text-[var(--theme-bg)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? '지원서 제출 중...' : '지원서 제출하기'}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Root router ────────────────────────────────────────────────────────────

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeView />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ─── Home page ──────────────────────────────────────────────────────────────

function HomeView() {
  const { user, loading: authLoading, logout } = useAuth()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState(null)
  const [bracketPositions, setBracketPositions] = useState({ leftX: null, rightX: null })
  const aboutRef = useRef(null)
  const activitiesRef = useRef(null)
  const projectsRef = useRef(null)
  const recruitRef = useRef(null)
  const [bottomHidden, setBottomHidden] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [latestNotice, setLatestNotice] = useState(null)
  const [activitiesExpanded, setActivitiesExpanded] = useState(false)
  const [projectsExpanded, setProjectsExpanded] = useState(false)

  const updateBracketPositions = (sectionId) => {
    const map = { about: aboutRef, activities: activitiesRef, projects: projectsRef, recruit: recruitRef }
    const ref = map[sectionId] || aboutRef
    const sectionEl = ref.current
    if (!sectionEl) return
    const panelEl = sectionEl.querySelector?.('[data-panel]') || sectionEl
    const rect = panelEl.getBoundingClientRect()
    const gap = 20
    setBracketPositions({
      leftX: Math.max(12, Math.round(rect.left - gap)),
      rightX: Math.round(rect.right + gap),
    })
  }

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset
      setBottomHidden(y > 120)
      const sections = [
        { id: 'about', ref: aboutRef },
        { id: 'activities', ref: activitiesRef },
        { id: 'projects', ref: projectsRef },
        { id: 'recruit', ref: recruitRef },
      ]
      let found = false
      let foundSectionId = null
      const centerY = window.innerHeight / 2
      for (const s of sections) {
        const sectionEl = s.ref.current
        if (!sectionEl) continue
        const panelEl = sectionEl.querySelector?.('[data-panel]') || sectionEl
        const rect = panelEl.getBoundingClientRect()
        const isCentered = rect.top <= centerY && rect.bottom >= centerY
        if (isCentered) {
          setActiveSection(s.id)
          foundSectionId = s.id
          found = true
          break
        }
      }
      updateBracketPositions(foundSectionId || 'about')
      if (!found && y < 140) setActiveSection(null)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
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
      const targetY = Math.max(0, window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2))
      window.scrollTo({ top: targetY, behavior: 'smooth' })
      setActiveSection(id)
      updateBracketPositions(id)
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
  const goRecruitForm = () => navigate('/recruit?apply=1')

  const bracketColor = activeSection ? sectionMeta[activeSection]?.bracket : sectionMeta.about.bracket

  const renderSectionContent = (id) => {
    if (id === 'about') {
      return (
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">About Signal</p>
          <h3 className="text-2xl font-semibold sm:text-3xl">COM&apos;s는 어떤 동아리인가요?</h3>
          <p className="max-w-3xl leading-8 text-white/85">
            COM&apos;s는 컴퓨터와 소프트웨어에 관심 있는 광운대학교 학생들이 모여 함께 공부하고 프로젝트를
            진행하는 중앙 컴퓨터 학술동아리입니다.
          </p>
          <p className="max-w-3xl leading-8 text-white/75">
            프로그래밍 기초부터 웹 개발, 알고리즘, 아두이노, 프로젝트 협업까지 다양한 활동을 통해 실력을 키우고
            서로의 성장을 돕습니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => openPanel('recruit')} className={solidActionBtnClass}>지원 화면으로 이동</button>
          </div>
        </div>
      )
    }
    if (id === 'activities') {
      return (
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-rose-200">Activities Signal</p>
          <h3 className="text-2xl font-semibold sm:text-3xl">주요 활동</h3>
          <div className="space-y-4">
            {activities.map((item) => (
              <div key={item} className="border-b border-white/10 pb-4 text-white/80 last:border-b-0 last:pb-0">{item}</div>
            ))}
          </div>
          {activitiesExpanded && (
            <div className="space-y-4 border-t border-white/14 pt-5">
              {activityDetails.map((item) => (
                <div key={item.title} className="space-y-1.5 border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                  <h4 className="text-base font-semibold text-white">{item.title}</h4>
                  <p className="leading-7 text-white/78">{item.description}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setActivitiesExpanded((open) => !open)} className={solidActionBtnClass}>
              {activitiesExpanded ? '활동 요약 보기' : '주요 활동 더 알아보기'}
            </button>
          </div>
        </div>
      )
    }
    if (id === 'projects') {
      return (
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-violet-200">Projects Signal</p>
          <h3 className="text-2xl font-semibold sm:text-3xl">프로젝트</h3>
          <div className="space-y-4">
            {projects.map((item) => (
              <div key={item} className="border-b border-white/10 pb-4 text-white/80 last:border-b-0 last:pb-0">{item}</div>
            ))}
          </div>
          {projectsExpanded && (
            <div className="space-y-4 border-t border-white/14 pt-5">
              {projectDetails.map((item) => (
                <div key={item.title} className="space-y-1.5 border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                  <h4 className="text-base font-semibold text-white">{item.title}</h4>
                  <p className="leading-7 text-white/78">{item.description}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setProjectsExpanded((open) => !open)} className={solidActionBtnClass}>
              {projectsExpanded ? '프로젝트 요약 보기' : '프로젝트 더 알아보기'}
            </button>
            <a href="https://github.com/kw-coms" target="_blank" rel="noreferrer" className={ghostActionBtnClass}>GitHub 확인</a>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-6">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200">Recruit Signal</p>
        <h3 className="text-2xl font-semibold sm:text-3xl">COM&apos;s 지원하기</h3>
        <p className="max-w-3xl leading-8 text-white/80">
          광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고, 만들고, 성장할 부원을 모집합니다. 개발을
          처음 시작하는 학생도 부담 없이 지원할 수 있습니다.
        </p>
        <div className="space-y-3 text-sm leading-7 text-white/80">
          <div>1. 지원 폼 작성</div>
          <div>2. 내부 확인 후 개별 연락</div>
          <div>3. 오리엔테이션 및 정기 활동 참여</div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={goRecruitForm} className={solidActionBtnClass}>지원서 작성하기</button>
          <button type="button" onClick={goNotices} className={ghostActionBtnClass}>모집 공지 보기</button>
        </div>
      </div>
    )
  }

  const renderSectionPanel = (id) => {
    const meta = sectionMeta[id]
    return (
      <div className="relative mx-auto flex w-full max-w-5xl items-center justify-center overflow-visible px-4 sm:px-14 lg:px-28">
        <div data-panel="true" className="relative z-10 w-full overflow-hidden rounded-2xl border border-white/12 shadow-lg" style={{ background: meta.background, boxShadow: `0 24px 80px ${meta.glow}` }}>
          <div className="px-12 py-8 sm:px-18 sm:py-12 lg:px-20">
            {renderSectionContent(id)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] selection:bg-[color-mix(in_srgb,var(--theme-accent)_35%,transparent)] selection:text-[var(--theme-text)]">
      <BackgroundLayers />
      <FixedBrackets color={bracketColor} leftX={bracketPositions.leftX} rightX={bracketPositions.rightX} />

      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 lg:px-8">
        <div className={`${floatingBarBaseClass} relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-5`}>
          <button type="button" onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex items-center gap-3 text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="logo-emboss h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.45em] text-[var(--theme-body-muted)]">KWANGWOON UNIVERSITY</p>
              <h1 className="mt-1 text-sm font-semibold text-[var(--theme-title)] sm:text-base">KW COM&apos;s</h1>
            </div>
          </button>

          <nav className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-6 md:flex">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => openPanel(tab.id)} className="px-1 text-sm font-semibold text-[var(--theme-body-dark)]/85 transition hover:text-[var(--theme-body-dark)]">
                {tab.label}
              </button>
            ))}
            <button type="button" onClick={goNotices} className="px-1 text-sm font-semibold text-[var(--theme-body-dark)]/85 transition hover:text-[var(--theme-body-dark)]">Notices</button>
            <button type="button" onClick={goArchive} disabled={authLoading} className="px-1 text-sm font-semibold text-[var(--theme-body-dark)]/85 transition hover:text-[var(--theme-body-dark)] disabled:cursor-wait disabled:opacity-60">Resources</button>
            <button type="button" onClick={goCommunity} disabled={authLoading} className="px-1 text-sm font-semibold text-[var(--theme-body-dark)]/85 transition hover:text-[var(--theme-body-dark)] disabled:cursor-wait disabled:opacity-60">Community</button>
          </nav>

          {user ? (
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <button type="button" onClick={goChangePassword} className="shape-cut-sm border border-black/10 bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/70" title="계정 설정">{user.name}</button>
              {user.role === 'ADMIN' && (
                <button type="button" onClick={goAdmin} className="shape-cut-sm border border-amber-300/45 bg-amber-100/70 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100">관리자</button>
              )}
              <button type="button" onClick={handleLogout} className="shape-cut-sm inline-flex items-center gap-2 border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/78">
                <LogOut size={15} />
                Logout
              </button>
            </div>
          ) : (
            <div className="ml-auto hidden w-16 md:block" aria-hidden="true" />
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="shape-cut-sm ml-auto flex items-center justify-center border border-black/10 bg-white/60 p-2 text-[var(--theme-body-dark)] transition hover:bg-white/78 md:hidden"
            aria-label="메뉴"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-haspopup="menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div id="mobile-menu" role="menu" className={`${floatingBarBaseClass} mx-auto mt-2 max-w-7xl overflow-hidden md:hidden`}>
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

      <aside className="fixed right-3 top-[80%] z-40 hidden -translate-y-1/2 md:block">
        <div className="flex flex-col gap-2">
          <SocialLink href="https://www.instagram.com/kw_coms" label="Instagram" icon={Instagram} />
          <SocialLink href="https://github.com/kw-coms" label="GitHub" icon={Github} />
          <SocialLink href="https://www.youtube.com/@kw_coms" label="YouTube" icon={Youtube} />
          <SocialLink href="mailto:kwcoms69@gmail.com" label="Mail" icon={Mail} />
        </div>
      </aside>

      <main className="relative mx-auto flex min-h-[100svh] max-w-7xl items-center px-4 py-16 sm:px-6 sm:py-18 lg:px-8">
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center text-center">
          <div className="relative w-full transition-all duration-300 opacity-100">
            <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center justify-center py-4 sm:py-6">
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <SplitLogoCard />
              </div>
              <div className="mt-5 space-y-3">
                <p className="mx-auto whitespace-nowrap px-2 leading-8 text-white/72 text-[clamp(0.68rem,1.55vw,1.125rem)]">
                  광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고, 만들고, 성장하는 개발 커뮤니티입니다.
                </p>
                <div className="flex flex-wrap justify-center gap-3 pt-3">
                  <button type="button" onClick={goArchive} disabled={authLoading} className={ghostActionBtnClass}>Resources</button>
                  <button type="button" onClick={goCommunity} disabled={authLoading} className={ghostActionBtnClass}>Community</button>
                </div>
                {latestNotice && (
                  <button type="button" onClick={goNotices} className="mx-auto mt-4 flex max-w-sm items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-4 py-2 text-left transition hover:bg-cyan-300/14">
                    <Megaphone size={13} className="shrink-0 text-cyan-300" />
                    <span className="truncate text-xs font-semibold text-cyan-100">{latestNotice.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-cyan-300/60">공지</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <nav
        className={`${floatingBarBaseClass} fixed inset-x-4 bottom-4 z-50 mx-auto max-w-5xl`}
        style={{ transform: bottomHidden ? 'translateY(48px)' : 'translateY(0)', opacity: bottomHidden ? 0 : 1, transition: 'transform .35s, opacity .35s' }}
      >
        <div className="grid grid-cols-2 divide-x divide-y divide-black/10 md:grid-cols-4 md:divide-y-0">
          {tabs.map((tab) => {
            const active = activeSection === tab.id
            return (
              <button key={tab.id} type="button" onClick={() => openPanel(tab.id)} className={`flex min-h-24 flex-col items-start justify-center p-4 text-left transition md:min-h-28 ${active ? 'bg-white/88 text-[var(--theme-body-dark)]' : 'bg-white/76 text-[var(--theme-body-mid)] hover:bg-white/84'}`}>
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${active ? 'text-[var(--theme-body-soft)]/75' : 'text-[var(--theme-body-muted)]/75'}`}>{tab.hint}</p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--theme-title)]">{tab.label}</h3>
                </div>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="mt-8">
        <section ref={aboutRef} id="about" className="relative py-24">
          <div className="mx-auto max-w-5xl px-4">{renderSectionPanel('about')}</div>
        </section>
        <section ref={activitiesRef} id="activities" className="relative py-24">
          <div className="mx-auto max-w-5xl px-4">{renderSectionPanel('activities')}</div>
        </section>
        <section ref={projectsRef} id="projects" className="relative py-24">
          <div className="mx-auto max-w-5xl px-4">{renderSectionPanel('projects')}</div>
        </section>
        <section ref={recruitRef} id="recruit" className="relative py-24">
          <div className="mx-auto max-w-5xl px-4">{renderSectionPanel('recruit')}</div>
        </section>
      </div>
    </div>
  )
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function PageShell({ children, wide = false }) {
  return (
    <div className="relative min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <BackgroundLayers />
      <main className={`relative mx-auto flex min-h-screen items-center justify-center px-4 py-28 sm:px-6 ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div className={`w-full ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>{children}</div>
      </main>
    </div>
  )
}

function BackgroundLayers() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="tech-grid absolute inset-0 opacity-100" />
      <div className="absolute left-[14%] top-[16%] h-72 w-72 rounded-full bg-cyan-300/35 blur-[100px] animate-blob" style={{ animationDelay: '0s', willChange: 'transform' }} />
      <div className="absolute right-[10%] top-[28%] h-80 w-80 rounded-full bg-rose-300/25 blur-[100px] animate-blob" style={{ animationDelay: '2.8s', willChange: 'transform' }} />
      <div className="absolute bottom-[10%] left-[42%] h-96 w-96 rounded-full bg-[var(--theme-glow-violet)]/25 blur-[120px] animate-blob" style={{ animationDelay: '5.4s', willChange: 'transform' }} />
      <div className="absolute left-0 top-[24%] h-px w-full bg-linear-to-r from-transparent via-white/15 to-transparent" />
      <div className="absolute left-[8%] top-0 h-full w-px bg-linear-to-b from-transparent via-cyan-200/15 to-transparent" />
      <div className="absolute left-0 top-[68%] h-px w-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
    </div>
  )
}

function SocialLink({ href, label, icon: Icon }) {
  return (
    <a
      href={href}
      target={href.startsWith('mailto:') ? undefined : '_blank'}
      rel={href.startsWith('mailto:') ? undefined : 'noreferrer'}
      className="shape-cut-sm flex items-center gap-2 border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-3 py-2 text-sm text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] transition hover:bg-white"
      aria-label={label}
    >
      <Icon size={16} />
      <span className="hidden xl:inline">{label}</span>
    </a>
  )
}

export default App
