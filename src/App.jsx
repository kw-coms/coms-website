import { useEffect, useRef, useState } from 'react'
import {
  Binary,
  CircuitBoard,
  Github,
  Instagram,
  LogIn,
  Mail,
  MapPinned,
  Rocket,
  Sparkles,
  Youtube,
  X,
} from 'lucide-react'
import SplitLogoCard from './components/common/SplitLogoCard.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import { getLogoAsset } from './utils/logoAssets.js'

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

const floatingBarBaseClass = 'shape-cut border border-white/70 bg-white/96 shadow-[0_22px_70px_rgba(255,255,255,0.24)] backdrop-blur-3xl supports-[backdrop-filter]:bg-white/94'

function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [expandedId, setExpandedId] = useState(null)
  const [lastExpandedId, setLastExpandedId] = useState(null)
  const [cursorDot, setCursorDot] = useState({ x: 0, y: 0, visible: false })
  const closeTimerRef = useRef(null)

  useEffect(() => {
    if (expandedId) {
      setLastExpandedId(expandedId)

      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [expandedId])

  useEffect(() => {
    if (expandedId) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''

      if (lastExpandedId) {
        if (closeTimerRef.current) {
          window.clearTimeout(closeTimerRef.current)
        }

        closeTimerRef.current = window.setTimeout(() => {
          setLastExpandedId(null)
          closeTimerRef.current = null
        }, 280)
      }
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [expandedId, lastExpandedId])
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 z-50 w-full border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6">
          <button type="button" className="flex min-w-0 items-center gap-2 sm:gap-3" onClick={goHome}>
            <img
              src="/coms-logo.png"
              alt="KW COM's Logo"
              className="h-11 w-11 shrink-0 object-contain sm:h-14 sm:w-14"
            />
            <span className="hidden truncate text-lg font-bold tracking-widest sm:block sm:text-xl">
              KW COM&apos;s
            </span>
          </button>

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (event.pointerType === 'touch') {
        return
      }

      setCursorDot({ x: event.clientX, y: event.clientY, visible: true })
    }

    const hideCursorDot = () => {
      setCursorDot((prev) => ({ ...prev, visible: false }))
    }

    window.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerleave', hideCursorDot)
    window.addEventListener('blur', hideCursorDot)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerleave', hideCursorDot)
      window.removeEventListener('blur', hideCursorDot)
    }
  }, [])

  const openPanel = (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }

    setCurrentPage('home')
    setExpandedId(id)
  }

  const closePanel = () => {
    setExpandedId(null)
  }

  const goHome = () => {
    setCurrentPage('home')
    setExpandedId(null)
    setLastExpandedId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goLogin = () => {
    setCurrentPage('login')
    setExpandedId(null)
    setLastExpandedId(null)
  }

  const goSignup = () => {
    setCurrentPage('signup')
    setExpandedId(null)
    setLastExpandedId(null)
  }

  const goRecruitPage = () => {
    setCurrentPage('recruit')
    setExpandedId(null)
    setLastExpandedId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activePanelId = expandedId ?? lastExpandedId
  const isPanelOpen = Boolean(expandedId)
  const ActiveIcon = activePanelId ? tabs.find((item) => item.id === activePanelId)?.icon : null

  const renderPanelContent = () => {
    if (!activePanelId) {
      return null
    }

    if (activePanelId === 'about') {
      return (
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">About Signal</p>
          <h3 className="text-2xl font-semibold sm:text-3xl">COM&apos;s는 어떤 동아리인가요?</h3>
          <p className="max-w-3xl leading-8 text-white/75">
            COM&apos;s는 컴퓨터와 소프트웨어에 관심 있는 광운대학교 학생들이 모여 함께 공부하고 프로젝트를
            진행하는 중앙 컴퓨터 학술동아리입니다.
          </p>
          <p className="max-w-3xl leading-8 text-white/65">
            프로그래밍 기초부터 웹 개발, 알고리즘, 아두이노, 프로젝트 협업까지 다양한 활동을 통해 실력을 키우고
            서로의 성장을 돕습니다.
          </p>
          <p className="max-w-3xl leading-8 text-white/65">
            개발을 처음 시작하는 학생도 부담 없이 참여할 수 있으며, 함께 배우고 직접 만들어보는 경험을 중요하게
            생각합니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={goRecruitPage} className="shape-cut-sm bg-[#EEEEEE] px-4 py-2 text-sm font-semibold text-[#222831] transition hover:scale-[1.02]">
              지원 화면으로 이동
            </button>
            <button type="button" onClick={goLogin} className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[#EEEEEE] transition hover:bg-white/20">
              로그인
            </button>
          </div>
        </div>
      )
    }

    if (activePanelId === 'activities') {
      return (
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-rose-200">Activities Signal</p>
          <h3 className="text-2xl font-semibold sm:text-3xl">주요 활동</h3>
          <div className="space-y-4">
            {activities.map((item) => (
              <div key={item} className="border-b border-white/10 pb-4 text-white/70 last:border-b-0 last:pb-0">
                {item}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={goRecruitPage} className="shape-cut-sm bg-[#EEEEEE] px-4 py-2 text-sm font-semibold text-[#222831] transition hover:scale-[1.02]">
              지원하기
            </button>
            <button type="button" onClick={goLogin} className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[#EEEEEE] transition hover:bg-white/20">
              로그인
            </button>
          </div>
        </div>
      )
    }

    if (activePanelId === 'projects') {
      return (
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-violet-200">Projects Signal</p>
          <h3 className="text-2xl font-semibold sm:text-3xl">프로젝트</h3>
          <div className="space-y-4">
            {projects.map((item) => (
              <div key={item} className="border-b border-white/10 pb-4 text-white/70 last:border-b-0 last:pb-0">
                {item}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={goRecruitPage} className="shape-cut-sm bg-[#EEEEEE] px-4 py-2 text-sm font-semibold text-[#222831] transition hover:scale-[1.02]">
              모집 안내 보기
            </button>
            <a href="https://github.com/kw-coms" target="_blank" rel="noreferrer" className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[#EEEEEE] transition hover:bg-white/20">
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
        <p className="max-w-3xl leading-8 text-white/70">
          광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고, 만들고, 성장할 부원을 모집합니다. 개발을
          처음 시작하는 학생도 부담 없이 지원할 수 있습니다.
        </p>
        <div className="space-y-3 text-sm leading-7 text-white/70">
          <div>1. 지원 폼 작성</div>
          <div>2. 내부 확인 후 개별 연락</div>
          <div>3. 오리엔테이션 및 정기 활동 참여</div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={goRecruitPage} className="shape-cut-sm bg-[#EEEEEE] px-4 py-2 text-sm font-semibold text-[#222831] transition hover:scale-[1.02]">
            지원 페이지 열기
          </button>
          <button type="button" onClick={goLogin} className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[#EEEEEE] transition hover:bg-white/20">
            로그인
          </button>
        </div>
      </div>
    )
  }

  if (currentPage === 'login') {
    return (
      <PageShell>
        <button type="button" onClick={goHome} className="shape-cut-sm mb-6 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[#EEEEEE] transition hover:bg-white/15">
          메인으로 돌아가기
        </button>
        <Login onBack={goHome} goSignup={goSignup} />
      </PageShell>
    )
  }

  if (currentPage === 'signup') {
    return (
      <PageShell>
        <button type="button" onClick={() => setCurrentPage('login')} className="shape-cut-sm mb-6 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[#EEEEEE] transition hover:bg-white/15">
          로그인으로 돌아가기
        </button>
        <Signup onBack={() => setCurrentPage('login')} />
      </PageShell>
    )
  }

  if (currentPage === 'recruit') {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#222831] text-[#EEEEEE]">
        <BackgroundLayers />
        <div className="relative mx-auto flex min-h-screen max-w-4xl items-center px-4 py-28 sm:px-6">
          <div className="w-full">
            <button type="button" onClick={goHome} className="shape-cut-sm mb-6 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[#EEEEEE] transition hover:bg-white/15">
              메인으로 돌아가기
            </button>
            <section className="shape-cut border border-white/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200">Recruit</p>
              <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">COM&apos;s 지원하기</h1>
              <p className="mt-6 max-w-3xl leading-8 text-white/70">
                광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고, 만들고, 성장할 부원을 모집합니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={goLogin} className="shape-cut-sm bg-[#EEEEEE] px-4 py-2 text-sm font-semibold text-[#222831] transition hover:scale-[1.02]">
                  로그인
                </button>
                <button type="button" onClick={() => setCurrentPage('home')} className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[#EEEEEE] transition hover:bg-white/20">
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
    <div className="cursor-dot-mode relative min-h-screen overflow-hidden bg-[#222831] text-[#EEEEEE] selection:bg-[#FFD369]/35 selection:text-[#EEEEEE]">
      <div
        className={`pointer-events-none fixed z-[120] hidden h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center mix-blend-difference transition-opacity duration-150 md:flex ${cursorDot.visible ? 'opacity-95' : 'opacity-0'}`}
        style={{ left: cursorDot.x, top: cursorDot.y }}
        aria-hidden="true"
      >
        <span className="absolute inset-0 rounded-full border border-white/90" />
        <span className="h-3 w-3 rounded-full bg-white" />
      </div>

      <BackgroundLayers />

      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 lg:px-8">
        <div className={`${floatingBarBaseClass} relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-5`}>
          <button type="button" onClick={goHome} className="flex items-center gap-3 text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="logo-emboss h-11 w-11 flex-shrink-0 object-contain sm:h-12 sm:w-12" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.45em] text-[#3a4350]">KWANGWOON UNIVERSITY</p>
              <h1 className="mt-1 text-sm font-semibold text-[#1a1f27] sm:text-base">KW COM&apos;s</h1>
            </div>
          </button>

          <nav className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-6 md:flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => openPanel(tab.id)}
                className="px-1 text-sm font-semibold text-[#1f2329]/85 transition hover:text-[#1f2329]"
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <button type="button" onClick={goLogin} className="shape-cut-sm ml-auto hidden border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[#1f2329] transition hover:bg-white/78 md:inline-flex">
            Login
          </button>
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
          <div className={`relative w-full transition-all duration-300 ${isPanelOpen ? 'opacity-10 blur-sm scale-95' : 'opacity-100'}`}>
            <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/15 blur-[100px] mix-blend-screen" />
            <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-[52%] -translate-y-[48%] rounded-full bg-rose-300/10 blur-[110px] mix-blend-screen" />
            <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-[48%] -translate-y-[52%] rounded-full bg-violet-300/10 blur-[120px] mix-blend-screen" />

            <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center justify-center py-4 sm:py-6">
              <SplitLogoCard />
                  <div>
                    <h4 className="font-bold">부회장</h4>
                    <p className="mt-2 text-[#151922]/80">김찬진 010-8596-2680</p>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </>
      )}

              <div className="mt-5 space-y-3">
                <p className="mx-auto whitespace-nowrap px-2 leading-8 text-white/72 text-[clamp(0.68rem,1.55vw,1.125rem)]">
                  광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고, 만들고, 성장하는 개발 커뮤니티입니다.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <nav className={`${floatingBarBaseClass} fixed inset-x-4 bottom-4 z-50 mx-auto max-w-5xl`}>
        <div className="grid grid-cols-2 divide-x divide-y divide-black/10 md:grid-cols-4 md:divide-y-0">
          {tabs.map((tab) => {
            const active = expandedId === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => openPanel(tab.id)}
                className={`flex min-h-24 flex-col items-start justify-center p-4 text-left transition md:min-h-28 ${active ? 'bg-white/88 text-[#1f2329]' : 'bg-white/76 text-[#2a3038] hover:bg-white/84'}`}
              >
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${active ? 'text-[#313844]/75' : 'text-[#3a4350]/75'}`}>{tab.hint}</p>
                  <h3 className="mt-2 text-lg font-semibold text-[#1a1f27]">{tab.label}</h3>
                </div>
              </button>
            )
          })}
        </div>
      </nav>

      {activePanelId && (
        <div className="fixed inset-0 z-40" role="presentation">
          <button
            type="button"
            onClick={closePanel}
            className={`absolute inset-0 bg-transparent transition-opacity duration-300 ${isPanelOpen ? 'opacity-100' : 'opacity-0'}`}
            aria-label="Close panel overlay"
          />

          <div className="pointer-events-none absolute inset-x-4 bottom-[8.4rem] z-10 mx-auto w-full max-w-5xl md:bottom-[6.9rem]">
            <div
              className={`shape-cut-top pointer-events-auto min-h-[21rem] border border-white/24 bg-white/22 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.16)] backdrop-blur-sm transition-all duration-300 sm:min-h-[24rem] sm:p-4 ${isPanelOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
              onClick={(event) => event.stopPropagation()}
              role="presentation"
            >
              <div className="shape-cut-top h-full border border-white/20 bg-white/14 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="shape-cut-sm border border-white/10 bg-white/10 p-3 text-[#EEEEEE]">
                      {ActiveIcon ? <ActiveIcon size={20} /> : null}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-[0.35em] ${tabs.find((item) => item.id === activePanelId)?.accent ?? 'text-cyan-200'}`}>{activePanelId.toUpperCase()}</p>
                      <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{activePanelId === 'about' ? 'ABOUT' : activePanelId === 'activities' ? 'ACTIVITIES' : activePanelId === 'projects' ? 'PROJECTS' : 'RECRUIT'}</h2>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closePanel}
                    className="shape-cut-sm border border-white/10 bg-white/10 p-3 text-[#EEEEEE] transition hover:bg-[#EEEEEE] hover:text-[#222831]"
                    aria-label="Close panel"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mt-6 pb-10">{renderPanelContent()}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PageShell({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#222831] text-[#EEEEEE]">
      <BackgroundLayers />
      <main className="relative mx-auto flex min-h-screen max-w-4xl items-center px-4 py-28 sm:px-6">{children}</main>
    </div>
  )
}

function BackgroundLayers() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="tech-grid absolute inset-0 opacity-100" />
      <div className="absolute left-[14%] top-[16%] h-72 w-72 rounded-full bg-cyan-300/20 blur-[100px] mix-blend-screen animate-blob" style={{ animationDelay: '0s' }} />
      <div className="absolute right-[10%] top-[28%] h-80 w-80 rounded-full bg-rose-300/15 blur-[100px] mix-blend-screen animate-blob" style={{ animationDelay: '2.8s' }} />
      <div className="absolute bottom-[10%] left-[42%] h-96 w-96 rounded-full bg-[#b26dff]/15 blur-[120px] mix-blend-screen animate-blob" style={{ animationDelay: '5.4s' }} />
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
      className="shape-cut-sm flex items-center gap-2 border border-white/70 bg-white/96 px-3 py-2 text-sm text-[#1f2329] shadow-[0_22px_70px_rgba(255,255,255,0.24)] backdrop-blur-3xl supports-[backdrop-filter]:bg-white/94 transition hover:bg-white"
      aria-label={label}
    >
      <Icon size={16} />
      <span className="hidden xl:inline">{label}</span>
    </a>
  )
}

export default App