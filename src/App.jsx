import { useState } from 'react'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState('home')
  const [isContactOpen, setIsContactOpen] = useState(false)

  const btnClass = 'rounded-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-semibold transition'

  const activities = [
    {
      title: '정기 세미나',
      desc: '프로그래밍, 웹 개발, 알고리즘, 컴퓨터 기초 등 다양한 주제로 정기 세미나를 진행합니다.',
    },
    {
      title: '스터디',
      desc: '신입 부원부터 기존 부원까지 함께 참여할 수 있는 수준별 스터디를 운영합니다.',
    },
    {
      title: '프로젝트',
      desc: '웹사이트, 앱, 아두이노, 소프트웨어 개발 등 팀 기반 프로젝트를 기획하고 제작합니다.',
    },
    {
      title: '교류 활동',
      desc: '선후배 간 개발 경험을 공유하고, 진로·학습·프로젝트 관련 정보를 함께 나눕니다.',
    },
  ]

  const projects = [
    {
      name: "COM's Official Website",
      tech: 'React · Vite · Tailwind CSS',
      desc: 'COM’s의 소개, 활동, 프로젝트, 모집 정보를 안내하기 위한 공식 웹사이트 제작 프로젝트입니다.',
    },
    {
      name: 'Arduino Basic Class',
      tech: 'Arduino · C/C++ · Circuit',
      desc: '초급자를 위한 아두이노 기초 교육 자료와 실습 예제를 제작하는 교육 프로젝트입니다.',
    },
    {
      name: 'Web Development Study',
      tech: 'HTML · CSS · JavaScript · React',
      desc: '웹 개발 기초부터 프론트엔드 프로젝트까지 학습하고 결과물을 정리하는 스터디입니다.',
    },
  ]

  const closeMenu = () => {
    setIsMenuOpen(false)
  }

  const goHome = () => {
    setCurrentPage('home')
    setIsMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goRecruit = () => {
    setCurrentPage('recruit')
    setIsMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openContact = () => {
    setIsContactOpen(true)
    setIsMenuOpen(false)
  }

  const goSection = (sectionId) => {
    setCurrentPage('home')
    setIsMenuOpen(false)

    setTimeout(() => {
      const section = document.getElementById(sectionId)
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' })
      }
    }, 0)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 z-50 w-full border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2">
          <button type="button" className="flex items-center gap-0" onClick={goHome}>
            <img
              src="/coms-logo.png"
              alt="KW COM's Logo"
              className="h-30 w-30 object-contain"
            />
            <span className="text-xl font-bold tracking-widest">
              KW COM&apos;s
            </span>
          </button>

          {/* PC Menu */}
          <nav className="hidden gap-8 text-sm text-gray-300 md:flex">
            <button
              type="button"
              onClick={() => goSection('about')}
              className="transition hover:text-white"
            >
              About
            </button>

            <button
              type="button"
              onClick={() => goSection('activities')}
              className="transition hover:text-white"
            >
              Activities
            </button>

            <button
              type="button"
              onClick={() => goSection('projects')}
              className="transition hover:text-white"
            >
              Projects
            </button>

            <button
              type="button"
              onClick={goRecruit}
              className="transition hover:text-white"
            >
              Recruit
            </button>

            <button
              type="button"
              onClick={openContact}
              className="transition hover:text-white"
            >
              Contact
            </button>
          </nav>

          {/* Login / Auth buttons (desktop) */}
          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => setCurrentPage('login')}
              className={btnClass}
            >
              login
            </button>
          </div>

          {/* Mobile Button */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-white md:hidden"
          >
            {isMenuOpen ? 'Close' : 'Menu'}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <nav className="border-t border-white/10 bg-black px-6 py-5 md:hidden">
            <div className="flex flex-col gap-4 text-sm text-gray-300">
              <button
                type="button"
                onClick={() => goSection('about')}
                className="text-left transition hover:text-white"
              >
                About
              </button>

              <button
                type="button"
                onClick={() => goSection('activities')}
                className="text-left transition hover:text-white"
              >
                Activities
              </button>

              <button
                type="button"
                onClick={() => goSection('projects')}
                className="text-left transition hover:text-white"
              >
                Projects
              </button>

              <button
                type="button"
                onClick={goRecruit}
                className="text-left transition hover:text-white"
              >
                Recruit
              </button>

              <button
                type="button"
                onClick={openContact}
                className="text-left transition hover:text-white"
              >
                Contact
              </button>

              <button
                type="button"
                onClick={() => { setCurrentPage('login'); setIsMenuOpen(false) }}
                className="text-left transition hover:text-white"
              >
                로그인
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Login Page */}
      {currentPage === 'login' && (
        <main className="min-h-screen bg-black px-6 pt-36 pb-24 text-white">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={goHome}
              className="mb-8 text-sm text-blue-400 transition hover:text-blue-300"
            >
              ← 메인으로 돌아가기
            </button>

            <Login
              onBack={goHome}
              goSignup={() => setCurrentPage('signup')}
            />
          </div>
        </main>
      )}

      {/* Signup Page (placeholder) */}
      {currentPage === 'signup' && (
        <main className="min-h-screen bg-black px-6 pt-36 pb-24 text-white">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={() => setCurrentPage('login')}
              className="mb-8 text-sm text-blue-400 transition hover:text-blue-300"
            >
              ← 로그인으로 돌아가기
            </button>

            <Signup onBack={() => setCurrentPage('login')} />
          </div>
        </main>
      )}

      {/* Recruit Page */}
      {currentPage === 'recruit' && (
        <main className="min-h-screen bg-black px-6 pt-36 pb-24 text-white">
          <div className="mx-auto max-w-5xl">
            <button
              type="button"
              onClick={goHome}
              className="mb-8 text-sm text-blue-400 transition hover:text-blue-300"
            >
              ← 메인으로 돌아가기
            </button>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-8 md:p-14">
              <p className="mb-3 text-sm font-semibold tracking-[0.3em] text-blue-400">
                RECRUIT
              </p>

              <h1 className="text-4xl font-bold md:text-5xl">
                COM&apos;s 지원하기
              </h1>

              <p className="mt-6 max-w-3xl leading-8 text-gray-300">
                광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고,
                만들고, 성장할 부원을 모집합니다. 개발을 처음 시작하는 학생도
                부담 없이 지원할 수 있습니다.
              </p>

              <div className="mt-10 grid gap-5 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                  <h3 className="font-bold">지원 대상</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-400">
                    컴퓨터와 개발에 관심 있는 광운대학교 학생
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                  <h3 className="font-bold">활동 분야</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-400">
                    웹 개발, 알고리즘, 아두이노, 프로젝트, 세미나
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                  <h3 className="font-bold">지원 조건</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-400">
                    꾸준히 활동할 의지가 있고 함께 성장하고 싶은 학생
                  </p>
                </div>
              </div>

              <div className="mt-10 rounded-2xl border border-blue-400/30 bg-blue-500/10 p-6">
                <h2 className="text-xl font-bold">지원 절차</h2>
                <ul className="mt-4 space-y-2 text-sm leading-7 text-gray-300">
                  <li>1. 지원 폼 작성</li>
                  <li>2. 내부 확인 후 개별 연락</li>
                  <li>3. 오리엔테이션 및 정기 활동 참여</li>
                </ul>
              </div>

              <div className="mt-10 rounded-2xl border border-white/10 bg-black/30 p-6">
                <h2 className="text-xl font-bold">지원 전 확인사항</h2>
                <ul className="mt-4 space-y-2 text-sm leading-7 text-gray-300">
                  <li>• 프로그래밍 경험이 없어도 지원 가능합니다.</li>
                  <li>• 정기 세미나와 스터디에 성실히 참여할 수 있어야 합니다.</li>
                  <li>• 팀 프로젝트와 동아리 활동에 적극적으로 참여하는 것을 권장합니다.</li>
                </ul>
              </div>

              <a
                href="#"
                className="mt-10 inline-block rounded-full bg-blue-500 px-8 py-3 font-semibold text-white transition hover:bg-blue-400"
              >
                지원 폼 준비 중
              </a>
            </section>
          </div>
        </main>
      )}

      {/* Home Page */}
      {currentPage === 'home' && (
        <>
          {/* Hero */}
          <section className="flex min-h-screen items-center justify-center px-6 pt-20">
            <div className="mx-auto max-w-5xl text-center">
              <p className="mb-5 text-xs font-semibold tracking-[0.35em] text-blue-400 sm:text-sm">
                KWANGWOON UNIVERSITY
              </p>

              <h2 className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
                KW COM&apos;s
              </h2>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-gray-300 sm:text-lg md:text-xl">
                광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s는 함께 배우고,
                만들고, 성장하는 개발 커뮤니티입니다.
              </p>

              <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => goSection('about')}
                  className="rounded-full bg-blue-500 px-8 py-3 font-semibold text-white transition hover:bg-blue-400"
                >
                  동아리 소개 보기
                </button>

                <button
                  type="button"
                  onClick={goRecruit}
                  className="rounded-full border border-white/20 px-8 py-3 font-semibold text-white transition hover:bg-white hover:text-black"
                >
                  지원하기
                </button>
              </div>
            </div>
          </section>

          {/* About */}
          <section id="about" className="border-t border-white/10 px-6 py-20 md:py-24">
            <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold tracking-[0.3em] text-blue-400">
                  ABOUT
                </p>
                <h2 className="text-3xl font-bold md:text-4xl">
                  COM&apos;s는 어떤 동아리인가요?
                </h2>
              </div>

              <div className="text-base leading-8 text-gray-300 md:text-lg">
                <p>
                  COM&apos;s는 컴퓨터와 소프트웨어에 관심 있는 광운대학교 학생들이
                  모여 함께 공부하고 프로젝트를 진행하는 중앙 컴퓨터
                  학술동아리입니다.
                </p>
                <p className="mt-5">
                  프로그래밍 기초부터 웹 개발, 알고리즘, 아두이노, 프로젝트 협업까지
                  다양한 활동을 통해 실력을 키우고 서로의 성장을 돕습니다.
                </p>
                <p className="mt-5">
                  개발을 처음 시작하는 학생도 부담 없이 참여할 수 있으며, 함께
                  배우고 직접 만들어보는 경험을 중요하게 생각합니다.
                </p>
              </div>
            </div>
          </section>

          {/* Activities */}
          <section id="activities" className="px-6 py-20 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-sm font-semibold tracking-[0.3em] text-blue-400">
                ACTIVITIES
              </p>
              <h2 className="text-3xl font-bold md:text-4xl">주요 활동</h2>
              <p className="mt-5 max-w-2xl leading-8 text-gray-400">
                COM&apos;s는 세미나, 스터디, 프로젝트, 교류 활동을 중심으로
                부원들이 지속적으로 성장할 수 있는 활동을 운영합니다.
              </p>

              <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {activities.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/10 bg-white/3 p-6 transition hover:-translate-y-1 hover:bg-white/6"
                  >
                    <h3 className="text-xl font-bold text-white">{item.title}</h3>
                    <p className="mt-4 leading-7 text-gray-400">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Projects */}
          <section id="projects" className="border-t border-white/10 px-6 py-20 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-sm font-semibold tracking-[0.3em] text-blue-400">
                PROJECTS
              </p>
              <h2 className="text-3xl font-bold md:text-4xl">프로젝트</h2>
              <p className="mt-5 max-w-2xl leading-8 text-gray-400">
                COM&apos;s는 단순한 학습을 넘어 실제 결과물을 만드는 프로젝트
                활동을 통해 실전 개발 경험을 쌓습니다.
              </p>

              <div className="mt-12 grid gap-6 md:grid-cols-3">
                {projects.map((project) => (
                  <div
                    key={project.name}
                    className="rounded-2xl border border-white/10 bg-linear-to-b from-white/8 to-white/2 p-6 transition hover:-translate-y-1"
                  >
                    <h3 className="text-xl font-bold">{project.name}</h3>
                    <p className="mt-2 text-sm font-semibold text-blue-400">
                      {project.tech}
                    </p>
                    <p className="mt-5 leading-7 text-gray-400">{project.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Recruit Preview */}
          <section id="recruit" className="px-6 py-20 md:py-24">
            <div className="mx-auto max-w-5xl rounded-3xl border border-blue-400/30 bg-blue-500/10 p-8 text-center md:p-16">
              <p className="mb-3 text-sm font-semibold tracking-[0.3em] text-blue-400">
                RECRUIT
              </p>

              <h2 className="text-3xl font-bold md:text-4xl">
                COM&apos;s와 함께할 부원을 모집합니다
              </h2>

              <p className="mx-auto mt-6 max-w-2xl leading-8 text-gray-300">
                개발을 처음 시작하는 학생도 환영합니다. COM&apos;s는 실력보다 함께
                배우려는 태도와 꾸준함을 중요하게 생각합니다.
              </p>

              <button
                type="button"
                onClick={goRecruit}
                className="mt-10 inline-block rounded-full bg-white px-8 py-3 font-semibold text-black transition hover:bg-gray-200"
              >
                지원 화면으로 이동
              </button>
            </div>
          </section>

          {/* Contact Footer */}
          <footer id="contact" className="bg-linear-to-b from-[#dbe8f7] to-[#cbdced] px-6 py-8 text-[#151922] lg:px-16">
            <div className="mx-auto max-w-7xl">
              <div className="flex flex-col gap-4 border-b border-[#151922]/20 pb-5 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-[#151922]/80">
                  Copyright © KW COM&apos;s All Rights Reserved.
                </p>

                <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
                  <a
                    href="https://www.instagram.com/kw_coms"
                    target="_blank"
                    rel="noreferrer"
                    className="transition hover:text-[#4f6f9f]"
                  >
                    Instagram
                  </a>

                  <a
                    href="https://github.com/kw-coms"
                    target="_blank"
                    rel="noreferrer"
                    className="transition hover:text-[#4f6f9f]"
                  >
                    GitHub
                  </a>

                  <a
                    href="https://www.youtube.com/@kw_coms"
                    target="_blank"
                    rel="noreferrer"
                    className="transition hover:text-[#4f6f9f]"
                  >
                    YouTube
                  </a>
                </div>
              </div>

              <div className="grid gap-8 pt-6 text-sm md:grid-cols-2">
                <div>
                  <h3 className="text-lg font-bold">
                    Made with ♥ by KW COM&apos;s
                  </h3>

                  <p className="mt-3 text-[#151922]/80">2026 Ver.</p>
                  <p className="mt-1 text-[#151922]/80">
                    Created by COM&apos;s Website Team
                  </p>

                  <div className="mt-5 space-y-1 text-[#151922]/80">
                    <p>광운대학교 복지관 403호</p>
                    <p>광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s</p>
                    <a
                      href="mailto:kwcoms69@gmail.com"
                      className="inline-block transition hover:text-[#4f6f9f]"
                    >
                      kwcoms69@gmail.com
                    </a>
                  </div>
                </div>

                <div className="space-y-5 md:text-right">
                  <div>
                    <h4 className="font-bold">회장</h4>
                    <p className="mt-2 text-[#151922]/80">김주찬 010-3436-4630</p>
                  </div>

                  <div>
                    <h4 className="font-bold">부회장</h4>
                    <p className="mt-2 text-[#151922]/80">김찬진 010-0000-0000</p>
                    <p className="mt-1 text-[#151922]/80">김근형 010-0000-0000</p>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Contact Modal */}
      {isContactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-lg rounded-3xl bg-[#dbe8f7] p-8 text-[#151922] shadow-2xl">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold tracking-[0.25em] text-[#4f6f9f]">
                  CONTACT
                </p>
                <h2 className="mt-3 text-2xl font-bold">COM&apos;s 문의하기</h2>
              </div>

              <button
                type="button"
                onClick={() => setIsContactOpen(false)}
                className="rounded-full px-3 py-1 text-xl font-bold transition hover:bg-black/10"
              >
                ×
              </button>
            </div>

            <div className="mt-8 space-y-5 text-sm leading-7">
              <div>
                <h3 className="font-bold">위치</h3>
                <p className="mt-1 text-[#151922]/80">
                  광운대학교 복지관 403호
                </p>
              </div>

              <div>
                <h3 className="font-bold">이메일</h3>
                <a
                  href="mailto:kwcoms69@gmail.com"
                  className="mt-1 inline-block text-[#4f6f9f] hover:underline"
                >
                  kwcoms69@gmail.com
                </a>
              </div>

              <div>
                <h3 className="font-bold">문의 가능 내용</h3>
                <p className="mt-1 text-[#151922]/80">
                  동아리 가입, 세미나, 프로젝트, 스터디, 협업 문의
                </p>
              </div>

              <div>
                <h3 className="font-bold">운영 안내</h3>
                <p className="mt-1 text-[#151922]/80">
                  문의 사항은 이메일 또는 COM&apos;s 공식 SNS를 통해 남겨주세요.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App