import { useEffect, useRef, useState } from 'react'
import {
  Binary,
  CircuitBoard,
  Github,
  Instagram,
  LogOut,
  Mail,
  Rocket,
  Sparkles,
  Youtube,
} from 'lucide-react'
import SplitLogoCard from './components/common/SplitLogoCard.jsx'
import Archive from './pages/Archive.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Notices from './pages/Notices.jsx'
import Admin from './pages/Admin.jsx'
import Community from './pages/Community.jsx'
import { getLogoAsset } from './utils/logoAssets.js'
import FixedBrackets from './components/common/FixedBrackets.jsx'
import { useAuth } from './contexts/useAuth.js'

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

const projects = [
  'COM\'s Official Website - React · Vite · Tailwind CSS 기반 공식 웹사이트',
  'Arduino Basic Class - 초급자를 위한 아두이노 기초 교육 프로젝트',
  'Web Development Study - HTML · CSS · JavaScript · React 학습 스터디',
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

function App() {
  const { user, loading: authLoading, logout } = useAuth()
  const [currentPage, setCurrentPage] = useState('home')
  const [activeSection, setActiveSection] = useState(null)
  const [bracketPositions, setBracketPositions] = useState({ leftX: null, rightX: null })
  const aboutRef = useRef(null)
  const activitiesRef = useRef(null)
  const projectsRef = useRef(null)
  const recruitRef = useRef(null)
  const [bottomHidden, setBottomHidden] = useState(false)

  const updateBracketPositions = (sectionId) => {
    const map = {
      about: aboutRef,
      activities: activitiesRef,
      projects: projectsRef,
      recruit: recruitRef,
    }

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
      // hide bottom nav when user scrolls down past hero area
      setBottomHidden(y > 120)

      // set active section based on scroll position
      const sections = [
        { id: 'about', ref: aboutRef },
        { id: 'activities', ref: activitiesRef },
        { id: 'projects', ref: projectsRef },
        { id: 'recruit', ref: recruitRef },
      ]

      // determine the section centered in the viewport
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

      if (!found) {
        if (y < 140) {
          setActiveSection(null)
        }
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const openPanel = (id) => {
    setCurrentPage('home')
    // scroll to the section instead of opening overlay
    const map = {
      about: aboutRef,
      activities: activitiesRef,
      projects: projectsRef,
      recruit: recruitRef,
    }

    const ref = map[id]
    if (ref && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const targetY = Math.max(0, window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2))
      window.scrollTo({ top: targetY, behavior: 'smooth' })
      setActiveSection(id)
      updateBracketPositions(id)
    }
  }

  const goHome = () => {
    setCurrentPage('home')
    setActiveSection(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goLogin = () => {
    setCurrentPage('login')
    setActiveSection(null)
  }

  const goArchive = () => {
    if (authLoading) return
    if (!user) {
      goLogin()
      return
    }

    setCurrentPage('archive')
    setActiveSection(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goCommunity = () => {
    if (authLoading) return
    if (!user) {
      goLogin()
      return
    }

    setCurrentPage('community')
    setActiveSection(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleLogout = async () => {
    await logout()
    goHome()
  }

  const goSignup = () => {
    setCurrentPage('signup')
    setActiveSection(null)
  }

  const goRecruitPage = () => {
    setCurrentPage('recruit')
    setActiveSection(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goNotices = () => {
    setCurrentPage('notices')
    setActiveSection(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goAdmin = () => {
    setCurrentPage('admin')
    setActiveSection(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
            <button type="button" onClick={goRecruitPage} className={solidActionBtnClass}>
              지원 화면으로 이동
            </button>
            <button type="button" onClick={goLogin} className={ghostActionBtnClass}>
              로그인
            </button>
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
              <div key={item} className="border-b border-white/10 pb-4 text-white/80 last:border-b-0 last:pb-0">
                {item}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={goRecruitPage} className={solidActionBtnClass}>
              지원하기
            </button>
            <button type="button" onClick={goLogin} className={ghostActionBtnClass}>
              로그인
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
              <div key={item} className="border-b border-white/10 pb-4 text-white/80 last:border-b-0 last:pb-0">
                {item}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={goRecruitPage} className={solidActionBtnClass}>
              모집 안내 보기
            </button>
            <a href="https://github.com/kw-coms" target="_blank" rel="noreferrer" className={ghostActionBtnClass}>
              GitHub 확인
            </a>
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
          <button type="button" onClick={goRecruitPage} className={solidActionBtnClass}>
            지원 페이지 열기
          </button>
          <button type="button" onClick={goLogin} className={ghostActionBtnClass}>
            로그인
          </button>
        </div>
      </div>
    )
  }

  const renderSectionPanel = (id) => {
    const meta = sectionMeta[id]

    return (
      <div className="relative mx-auto flex w-full max-w-5xl items-center justify-center overflow-visible px-14 sm:px-20 lg:px-28">
        <div data-panel="true" className="relative z-10 w-full overflow-hidden rounded-2xl border border-white/12 shadow-lg" style={{ background: meta.background, boxShadow: `0 24px 80px ${meta.glow}` }}>
          <div className="px-12 py-8 sm:px-18 sm:py-12 lg:px-20">
            {renderSectionContent(id)}
          </div>
        </div>
      </div>
    )
  }

  if (currentPage === 'login') {
    return (
      <PageShell>
        <Login onBack={goHome} goSignup={goSignup} />
      </PageShell>
    )
  }

  if (currentPage === 'archive') {
    if (authLoading) {
      return (
        <PageShell>
          <div className="shape-cut border border-white/10 bg-white/5 p-8 text-center text-white/70 backdrop-blur-md">
            로그인 상태를 확인하는 중...
          </div>
        </PageShell>
      )
    }

    if (!user) {
      return (
        <PageShell>
          <Login onBack={goHome} goSignup={goSignup} />
        </PageShell>
      )
    }

    return (
      <PageShell wide>
        <Archive onBack={goHome} />
      </PageShell>
    )
  }

  if (currentPage === 'community') {
    if (authLoading) {
      return (
        <PageShell>
          <div className="shape-cut border border-white/10 bg-white/5 p-8 text-center text-white/70 backdrop-blur-md">
            로그인 상태를 확인하는 중...
          </div>
        </PageShell>
      )
    }

    if (!user) {
      return (
        <PageShell>
          <Login onBack={goHome} goSignup={goSignup} />
        </PageShell>
      )
    }

    return (
      <PageShell wide>
        <Community onBack={goHome} />
      </PageShell>
    )
  }

  if (currentPage === 'signup') {
    return (
      <PageShell>
        <button type="button" onClick={() => setCurrentPage('login')} className="shape-cut-sm mb-6 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/15">
          로그인으로 돌아가기
        </button>
        <Signup onBack={() => setCurrentPage('login')} />
      </PageShell>
    )
  }

  if (currentPage === 'notices') {
    return (
      <PageShell>
        <Notices onBack={goHome} />
      </PageShell>
    )
  }

  if (currentPage === 'admin') {
    return (
      <PageShell>
        <Admin onBack={goHome} />
      </PageShell>
    )
  }

  if (currentPage === 'recruit') {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]">
        <BackgroundLayers />
        <div className="relative mx-auto flex min-h-screen max-w-4xl items-center px-4 py-28 sm:px-6">
          <div className="w-full">
            <button type="button" onClick={goHome} className="shape-cut-sm mb-6 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/15">
              메인으로 돌아가기
            </button>
            <section className="shape-cut border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200">Recruit</p>
              <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">COM&apos;s 지원하기</h1>
              <p className="mt-6 max-w-3xl leading-8 text-white/70">
                광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고, 만들고, 성장할 부원을 모집합니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={goLogin} className={solidActionBtnClass}>
                  로그인
                </button>
                <button type="button" onClick={() => setCurrentPage('home')} className={ghostActionBtnClass}>
                  홈으로
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen  bg-[var(--theme-bg)] text-[var(--theme-text)] selection:bg-[color-mix(in_srgb,var(--theme-accent)_35%,transparent)] selection:text-[var(--theme-text)]">
      <BackgroundLayers />

      <FixedBrackets color={bracketColor} leftX={bracketPositions.leftX} rightX={bracketPositions.rightX} />

      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 lg:px-8">
        <div className={`${floatingBarBaseClass} relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-5`}>
          <button type="button" onClick={goHome} className="flex items-center gap-3 text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="logo-emboss h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.45em] text-[var(--theme-body-muted)]">KWANGWOON UNIVERSITY</p>
              <h1 className="mt-1 text-sm font-semibold text-[var(--theme-title)] sm:text-base">KW COM&apos;s</h1>
            </div>
          </button>

          <nav className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-6 md:flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => openPanel(tab.id)}
                className="px-1 text-sm font-semibold text-[var(--theme-body-dark)]/85 transition hover:text-[var(--theme-body-dark)]"
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              onClick={goNotices}
              className="px-1 text-sm font-semibold text-[var(--theme-body-dark)]/85 transition hover:text-[var(--theme-body-dark)]"
            >
              공지사항
            </button>
            {user && (
              <button
                type="button"
                onClick={goArchive}
                className="px-1 text-sm font-semibold text-[var(--theme-body-dark)]/85 transition hover:text-[var(--theme-body-dark)]"
              >
                자료실
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={goCommunity}
                className="px-1 text-sm font-semibold text-[var(--theme-body-dark)]/85 transition hover:text-[var(--theme-body-dark)]"
              >
                커뮤니티
              </button>
            )}
          </nav>

          {user ? (
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <span className="shape-cut-sm border border-black/10 bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)]">
                {user.name}
              </span>
              {user.role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={goAdmin}
                  className="shape-cut-sm border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/78"
                >
                  관리자
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="shape-cut-sm inline-flex items-center gap-2 border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/78"
              >
                <LogOut size={15} />
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={goLogin}
              disabled={authLoading}
              className="shape-cut-sm ml-auto hidden border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/78 disabled:cursor-wait disabled:opacity-70 md:inline-flex"
            >
              Login
            </button>
          )}
        </div>
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
                {user && (
                  <div className="flex flex-wrap justify-center gap-3 pt-3">
                    <button type="button" onClick={goArchive} className={ghostActionBtnClass}>
                      자료실로 이동
                    </button>
                    <button type="button" onClick={goCommunity} className={ghostActionBtnClass}>
                      커뮤니티
                    </button>
                  </div>
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
              <button
                key={tab.id}
                type="button"
                onClick={() => openPanel(tab.id)}
                className={`flex min-h-24 flex-col items-start justify-center p-4 text-left transition md:min-h-28 ${active ? 'bg-white/88 text-[var(--theme-body-dark)]' : 'bg-white/76 text-[var(--theme-body-mid)] hover:bg-white/84'}`}
              >
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
          <div className="mx-auto max-w-5xl px-4">
            {renderSectionPanel('about')}
          </div>
        </section>

        <section ref={activitiesRef} id="activities" className="relative py-24">
          <div className="mx-auto max-w-5xl px-4">
            {renderSectionPanel('activities')}
          </div>
        </section>

        <section ref={projectsRef} id="projects" className="relative py-24">
          <div className="mx-auto max-w-5xl px-4">
            {renderSectionPanel('projects')}
          </div>
        </section>

        <section ref={recruitRef} id="recruit" className="relative py-24">
          <div className="mx-auto max-w-5xl px-4">
            {renderSectionPanel('recruit')}
          </div>
        </section>
      </div>
    </div>
  )
}

function PageShell({ children, wide = false }) {
  return (
    <div className="relative min-h-screen  bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <BackgroundLayers />
      <main className={`relative mx-auto flex min-h-screen items-center justify-center px-4 py-28 sm:px-6 ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div className={`w-full ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>{children}</div>
      </main>
    </div>
  )
}

function BackgroundLayers() {
  return (
    <div className="pointer-events-none absolute inset-0 ">
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
