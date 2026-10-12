import { useEffect, useRef } from 'react'
import { useNavigate, useLocation, type NavigateOptions, type To } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronDown, Code2, Cpu, FolderOpen, Globe, Megaphone, MessagesSquare } from 'lucide-react'
import { listNotices } from '../../services/noticeApi'
import { getPublicSiteSettings } from '../../services/siteSettingsApi'
import {
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
} from '../../data/homeContent'
import { getLogoAsset } from '../../utils/logoAssets'
import { ghostActionBtnClass, solidActionBtnClass } from '../../shared/homeUi'
import ClubCalendarSection from '../../features/clubCalendar/ClubCalendarSection'
import HeroField from './HeroField'
import { BuildMini, ClubOsVisual, FlowMini, JoinFlowVisual, JoinMini, LearningStackVisual, ProjectLabVisual } from './HomeVisuals'
import { scrollToTopInstant } from '../../utils/themeColors'
import { useAuth } from '../../contexts/useAuth'

const LATEST_NOTICE_QUERY_KEY = ['app-shell', 'latest-notice']
const SITE_SETTINGS_QUERY_KEY = ['site-settings', 'public']

// Artwork and icons, in the order of the lists they sit beside in homeContent.
const SHOWCASE_ART = [FlowMini, BuildMini, JoinMini]
const HUB_ICONS = [Megaphone, MessagesSquare, FolderOpen]
const PROJECT_ICONS = [Globe, Cpu, Code2]

export default function HomeView() {
  const { user } = useAuth()
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
    enabled: Boolean(user),
    select: (data) => {
      const notices = Array.isArray(data) ? data : []
      return notices.find((n) => (n.category || 'GENERAL') === 'GENERAL') ?? null
    },
  })
  const latestNotice = latestNoticeQuery.data ?? null
  const siteSettingsQuery = useQuery({
    queryKey: SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
  })
  const siteSettings = siteSettingsQuery.data
  const heroTitle = siteSettings?.homeHeroTitle || 'COM\'s'

  // The hero is complete the moment the page is on screen; as the page scrolls past it, it
  // sinks back a little. Plus reveal-on-scroll for the sections below.
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
    // Reduced motion (or no track): the hero simply scrolls away with the page.
    if (prefersReduced || !track) {
      return () => {
        io.disconnect()
        document.documentElement.classList.remove('home-snap-scroll')
      }
    }

    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        // 0 with the hero in full view, 1 once the page has scrolled most of it away.
        const out = Math.min(1, Math.max(0, -track.getBoundingClientRect().top / Math.max(1, track.offsetHeight * 0.85)))
        track.style.setProperty('--hero-out', out.toFixed(3))
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
  const goPageTop = (to: To, options?: NavigateOptions) => {
    scrollToTopInstant()
    navigate(to, options)
  }
  const goRecruitPage = () => goPageTop('/recruit')
  const locationPath = () => `${location.pathname}${location.search}${location.hash}`

  // The words of a section: label, title, lede and its two actions. `index` is the section's
  // place in the page, shown before the label.
  const renderSectionCopy = (id, index) => {
    const story = sectionStories[id]

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
      <>
        <p data-reveal className="coms-label"><b>{index}</b><i />{sectionMeta[id].eyebrow}</p>
        <h2 data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties} className="coms-title">{story.title}</h2>
        <p data-reveal style={{ '--reveal-delay': '160ms' } as React.CSSProperties} className="coms-lede">{story.body}</p>
        <div data-reveal style={{ '--reveal-delay': '240ms' } as React.CSSProperties} className="coms-actions">
          <button type="button" onClick={primaryAction} className={solidActionBtnClass}>{story.primary}</button>
          {id === 'projects' ? (
            <a href="https://github.com/kw-coms" target="_blank" rel="noreferrer" className={ghostActionBtnClass}>{story.secondary}</a>
          ) : (
            <button type="button" onClick={secondaryAction} className={ghostActionBtnClass}>{story.secondary}</button>
          )}
        </div>
      </>
    )
  }

  const renderSectionStats = (id, column = false) => (
    <div className={`coms-stats ${column ? 'coms-stats-column' : ''}`}>
      {sectionMetrics[id].map((item, index) => (
        <div key={item.value} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties} className="coms-stat">
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )

  const renderDetailCard = (item, index, Icon = null) => (
    <div key={item.title} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties} className="h-full">
      <article className="coms-card">
        <span className="coms-card-num">{String(index + 1).padStart(2, '0')}</span>
        {Icon && <span className="coms-icon"><Icon size={22} strokeWidth={2} /></span>}
        <h3 className="coms-card-title">{item.title}</h3>
        <p className="coms-card-body">{item.description}</p>
      </article>
    </div>
  )

  return (
    <div className="theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">

      <main className="apple-home-main relative overflow-x-clip">
        <section className="coms-cinema coms-3d-stage" aria-label="COM's">
          <div ref={trackRef} className="coms-cinema-track">
            <div className="coms-cinema-pin">
              <div className="home-hero-surface absolute inset-0" />
              <HeroField />
              <div className="coms-cinema-fade absolute inset-x-0 bottom-0 h-1/3" />

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
                <div className="coms-depth-lg relative flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
                  <div className="coms-3d-card absolute inset-0 rounded-[1.5rem] bg-white/82 ring-1 ring-black/5" />
                  <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="coms-logo-3d relative z-10 h-14 w-14 object-contain sm:h-16 sm:w-16" />
                </div>
                <h1 className={`apple-display coms-3d-title coms-cinema-title mt-4 whitespace-nowrap text-6xl sm:text-7xl ${heroTitle.length <= 8 ? 'coms-cinema-title-lg' : ''}`}>
                  {heroTitle}
                </h1>
                <div className="coms-depth-sm mt-4 inline-flex items-center gap-2 rounded-full bg-white/64 px-3 py-1.5 text-xs font-semibold text-[var(--app-muted)] shadow-[0_4px_16px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                  <span className="coms-live-dot size-2 rounded-full bg-[var(--app-accent)]" />
                  {siteSettings?.semesterLabel || '2026 Semester Ready'}
                </div>
                <p className="coms-depth-sm mt-4 text-sm font-semibold text-[var(--app-muted)]">Kwangwoon University Computer Club</p>
                <p className="apple-copy mx-auto mt-3 max-w-[20rem] text-lg sm:max-w-3xl sm:text-2xl">
                  {siteSettings?.homeHeroCopy || '배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.'}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={() => openPanel('about')} className={solidActionBtnClass}>더 알아보기</button>
                  <button type="button" onClick={goRecruitPage} className={ghostActionBtnClass}>지원하기</button>
                </div>
                {latestNotice && (
                  <button type="button" onClick={goNotices} className="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-full bg-[var(--app-surface)] px-4 py-2 text-left shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition hover:shadow-[0_5px_18px_rgba(0,0,0,0.12)]">
                    <Megaphone size={14} className="shrink-0 text-[var(--app-accent-text)]" />
                    <span className="truncate text-xs font-semibold text-[var(--app-text)]">{latestNotice.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-bold uppercase text-[var(--app-accent-text)]">공지</span>
                  </button>
                )}
                <div className="mx-auto mt-5 flex max-w-[21rem] flex-wrap justify-center gap-2 sm:max-w-3xl">
                  {experiencePills.map((pill) => (
                    <span key={pill} className="rounded-full bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--app-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:px-3 sm:text-xs">
                      {pill}
                    </span>
                  ))}
                </div>
                <div className="apple-hero-metrics mx-auto mt-7 hidden max-w-3xl grid-cols-3 sm:grid">
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

        {/* Three ways in, each with a small piece of artwork */}
        <section className="coms-sec coms-sec-top coms-sec-tight">
          <div className="coms-sec-inner">
            <div className="coms-hscroll">
              {showcaseItems.map((item, index) => {
                const Art = SHOWCASE_ART[index % SHOWCASE_ART.length]
                return (
                  <div key={item.title} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties} className="coms-hslide">
                    <button type="button" onClick={() => openPanel(item.target)} className="coms-card w-full">
                      <Art />
                      <p className="coms-card-eyebrow">{item.eyebrow}</p>
                      <h3 className="coms-card-title">{item.title}</h3>
                      <p className="coms-card-body">{item.body}</p>
                      <span className="coms-card-go">더 보기 <ArrowRight size={16} /></span>
                    </button>
                  </div>
                )
              })}
            </div>
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

        <section className="coms-sec coms-sec-left coms-sec-tight">
          <div className="coms-sec-inner">
            <div className="coms-rowhead">
              <div data-reveal>
                <p className="coms-label"><b>01</b><i />Member loop</p>
                <h2 className="coms-title">활동 허브</h2>
                <p className="coms-lede">
                  공지, 커뮤니티, 자료실을 한 번에 이어서 부원이 다시 들어올 이유를 분명하게 만듭니다.
                </p>
              </div>
              <button type="button" onClick={() => goPageTop('/notices')} className={ghostActionBtnClass}>최근 공지 보기</button>
            </div>
            <div className="coms-hscroll mt-9">
              {activityHubItems.map((item, index) => {
                const Icon = HUB_ICONS[index % HUB_ICONS.length]
                return (
                  <div key={item.title} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties} className="coms-hslide">
                    <button type="button" onClick={() => goPageTop(item.route)} className="coms-card w-full">
                      <span className="coms-card-num">{String(index + 1).padStart(2, '0')}</span>
                      <span className="coms-icon"><Icon size={22} strokeWidth={2} /></span>
                      <h3 className="coms-card-title">{item.title}</h3>
                      <p className="coms-card-body">{item.body}</p>
                      <span className="coms-card-go">{item.cta} <ArrowRight size={16} /></span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <ClubCalendarSection compact />

        {/* About: copy on the left, the club as a small operating system on the right */}
        <section ref={aboutRef} id="about" className="home-snap-section coms-sec">
          <div className="coms-sec-inner coms-split">
            <div>
              {renderSectionCopy('about', '02')}
              {renderSectionStats('about')}
            </div>
            <div data-reveal data-reveal-dir="right" style={{ '--reveal-delay': '120ms' } as React.CSSProperties}>
              <ClubOsVisual {...visualDetails.about} />
            </div>
          </div>
        </section>

        {/* Activities: mirrored, the stack on the left, with what the routine is made of below */}
        <section ref={activitiesRef} id="activities" className="home-snap-section coms-sec coms-sec-left">
          <div className="coms-sec-inner">
            <div className="coms-split coms-split-flip">
              <div>
                {renderSectionCopy('activities', '03')}
                {renderSectionStats('activities')}
              </div>
              <div data-reveal data-reveal-dir="left" style={{ '--reveal-delay': '120ms' } as React.CSSProperties}>
                <LearningStackVisual {...visualDetails.activities} />
              </div>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {activityDetails.slice(0, 2).map((item, index) => renderDetailCard(item, index))}
            </div>
          </div>
        </section>

        {/* Projects: a centred heading over one board: the pipeline, its tracks, the projects */}
        <section ref={projectsRef} id="projects" className="home-snap-section coms-sec coms-sec-top">
          <div className="coms-sec-inner">
            <div className="coms-center">
              {renderSectionCopy('projects', '04')}
            </div>
            <div className="coms-bento">
              <div data-reveal className="coms-bento-wide">
                <ProjectLabVisual {...visualDetails.projects} />
              </div>
              <div className="coms-bento-side">
                {renderSectionStats('projects', true)}
              </div>
              {projectDetails.slice(0, 3).map((item, index) => (
                <div key={item.title} className="coms-bento-third">
                  {renderDetailCard(item, index, PROJECT_ICONS[index % PROJECT_ICONS.length])}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Recruit: the call to join, in one lit panel */}
        <section ref={recruitRef} id="recruit" className="home-snap-section coms-sec coms-sec-low">
          <div className="coms-sec-inner">
            <div className="coms-cta coms-split">
              <div>
                {renderSectionCopy('recruit', '05')}
                {renderSectionStats('recruit')}
              </div>
              <div data-reveal data-reveal-dir="right" style={{ '--reveal-delay': '120ms' } as React.CSSProperties}>
                <JoinFlowVisual {...visualDetails.recruit} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
