import { useState } from 'react'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 z-50 w-full border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2">
          <a href="#" className="flex items-center gap-0" onClick={closeMenu}>
            <img
              src="/coms-logo.png"
              alt="KW COM's Logo"
              className="h-30 w-30 object-contain"
            />
            <span className="text-xl font-bold tracking-widest">KW COM&apos;s</span>
          </a>

          {/* PC Menu */}
          <nav className="hidden gap-8 text-sm text-gray-300 md:flex">
            <a href="#about" className="transition hover:text-white">
              About
            </a>
            <a href="#activities" className="transition hover:text-white">
              Activities
            </a>
            <a href="#projects" className="transition hover:text-white">
              Projects
            </a>
            <a href="#recruit" className="transition hover:text-white">
              Recruit
            </a>
            <a href="#contact" className="transition hover:text-white">
              Contact
            </a>
          </nav>

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
              <a href="#about" onClick={closeMenu} className="transition hover:text-white">
                About
              </a>
              <a href="#activities" onClick={closeMenu} className="transition hover:text-white">
                Activities
              </a>
              <a href="#projects" onClick={closeMenu} className="transition hover:text-white">
                Projects
              </a>
              <a href="#recruit" onClick={closeMenu} className="transition hover:text-white">
                Recruit
              </a>
              <a href="#contact" onClick={closeMenu} className="transition hover:text-white">
                Contact
              </a>
            </div>
          </nav>
        )}
      </header>

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
            <a
              href="#about"
              className="rounded-full bg-blue-500 px-8 py-3 font-semibold text-white transition hover:bg-blue-400"
            >
              동아리 소개 보기
            </a>

            <a
              href="#recruit"
              className="rounded-full border border-white/20 px-8 py-3 font-semibold text-white transition hover:bg-white hover:text-black"
            >
              모집 안내 보기
            </a>
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

{/* Contact */}
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
          className="transition hover:opacity-70"
        >
          Instagram
        </a>

        <a
          href="https://github.com/kw-coms"
          target="_blank"
          rel="noreferrer"
          className="transition hover:opacity-70"
        >
          GitHub
        </a>

        <a
          href="https://www.youtube.com/@kw_coms"
          target="_blank"
          rel="noreferrer"
          className="transition hover:opacity-70"
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
          <p>서울특별시 노원구 광운로 20, 광운대학교 복지관 403호</p>
          <p>광운대학교 중앙 컴퓨터 학술동아리 COM&apos;s</p>
          <a>
            kwcoms69@gmail.com
          </a>
        </div>
      </div>

      <div className="space-y-5 md:text-right">
        <div>
          <h4 className="font-bold">회장</h4>
          <p className="mt-2 text-[#151922]/80">이름 010-0000-0000</p>
        </div>

        <div>
          <h4 className="font-bold">부회장</h4>
          <p className="mt-2 text-[#151922]/80">이름 010-0000-0000</p>
          <p className="mt-1 text-[#151922]/80">이름 010-0000-0000</p>
        </div>
      </div>
    </div>
  </div>
</footer>
    </div>
  )
}

export default App