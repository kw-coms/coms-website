import { useEffect, useRef } from 'react'
import { useNavigate, useLocation, type NavigateOptions, type To } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Megaphone } from 'lucide-react'
import { listNotices } from '../../services/noticeApi'
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
import { scrollToTopInstant } from '../../utils/themeColors'

const LATEST_NOTICE_QUERY_KEY = ['app-shell', 'latest-notice']

export default function HomeView() {
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
  const goPageTop = (to: To, options?: NavigateOptions) => {
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
            <h2 data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties} className="apple-display mt-4 text-5xl sm:text-6xl lg:text-7xl">{story.title}</h2>
            <p data-reveal style={{ '--reveal-delay': '160ms' } as React.CSSProperties} className="apple-copy mx-auto mt-6 max-w-3xl text-xl sm:text-2xl">{story.body}</p>
            <div data-reveal style={{ '--reveal-delay': '240ms' } as React.CSSProperties} className="mt-8 flex flex-wrap justify-center gap-3">
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
              <div key={item.value} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties} className="apple-soft-panel px-4 py-5 text-center">
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
                  style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
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
                <article key={item.title} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties} className="apple-product-panel px-6 py-6 text-left transition hover:-translate-y-0.5">
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
          <div data-reveal data-reveal-dir="right" style={{ '--reveal-delay': '120ms' } as React.CSSProperties} className="flex items-center justify-center">
            <div className="home-device apple-device-card relative aspect-square min-h-[30rem] w-full max-w-md overflow-hidden rounded-lg ring-1 ring-black/5" style={{ background: meta.visual }}>
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
                style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
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
                  style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
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
