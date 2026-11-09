import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, type LucideIcon } from 'lucide-react'
import {
  aboutDetailCards,
  aboutDetailPrinciples,
  activitiesDetailCards,
  activitiesDetailFlow,
  activitiesDetailTopics,
  projectsDetailCards,
  projectsDetailFlow,
  projectsDetailOutputs,
} from '../../data/homeContent'
import CompanionServicesSection from '../../components/home/CompanionServicesSection'
import ActivityLogSection from '../../features/activityLog/ActivityLogSection'
import ClubEventSection from '../../features/clubEvent/ClubEventSection'
import ActivityTimeline from '../../components/activities/ActivityTimeline'
import ClubCalendarSection from '../../features/clubCalendar/ClubCalendarSection'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import HeroField from './HeroField'
import '../../styles/site-pages.css'
import { ClubOsVisual, LearningStackVisual, ProjectLabVisual } from './HomeVisuals'

const DETAIL_TITLE_MIN_FIT = 0.74

export function AboutPage() {
  return (
    <DetailStoryPage
      eyebrow="About COM's"
      title="함께 배우고, 바로 만듭니다."
      body="COM's는 광운대학교 학생들이 컴퓨터와 소프트웨어를 함께 공부하고, 실제 프로젝트로 연결하는 중앙 컴퓨터 학술동아리입니다."
      visual={<ClubOsVisual title="Club OS" subtitle="Study · Build · Share" rows={['학습 로드맵', '프로젝트 트랙', '커뮤니티 로그']} />}
      cardsTitle="공부하고, 만들고, 나눕니다."
      cards={aboutDetailCards}
      outputsTitle="COM's가 오래 가져가는 태도."
      outputsBody="잘하는 사람만 모이는 곳보다, 함께 성장하는 방식을 계속 만드는 곳을 지향합니다."
      outputs={aboutDetailPrinciples}
    />
  )
}

export function DetailStoryPage({
  eyebrow,
  title,
  body,
  visual,
  cardsTitle,
  cards,
  flowTitle,
  flow,
  outputsTitle,
  outputsBody,
  outputs,
  lead,
  className = '',
}: {
  eyebrow?: React.ReactNode
  title?: React.ReactNode
  body?: React.ReactNode
  visual: React.ReactNode
  cardsTitle: React.ReactNode
  cards: { title: string; eyebrow: string; body: string; icon: LucideIcon }[]
  /** Only for a real sequence of steps; leave both out and the section is not drawn. */
  flowTitle?: React.ReactNode
  flow?: string[][]
  outputsTitle?: React.ReactNode
  outputsBody?: string
  outputs: string[]
  /** Shown straight after the hero, ahead of the cards. */
  lead?: React.ReactNode
  className?: string
}) {
  const navigate = useNavigate()
  const titleRef = useRef<HTMLHeadingElement>(null)
  useScrollReveal()

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

        const phrases = Array.from(titleEl.querySelectorAll('.apple-detail-title-phrase')) as HTMLElement[]
        if (phrases.length === 0) return

        const availableWidth = titleEl.clientWidth
        const currentFit = Number.parseFloat(getComputedStyle(titleEl).getPropertyValue('--apple-title-fit')) || 1
        const widestPhrase = phrases.reduce((max: number, phrase) => Math.max(max, phrase.scrollWidth / currentFit), 0)
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
    <div className={`apple-detail-page ${className} theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]`}>
      <main className="apple-detail-main coms-detail relative overflow-hidden">
        <section className="apple-detail-hero relative grid min-h-[calc(88svh-44px)] items-center gap-12 overflow-hidden bg-[var(--app-surface-soft)] px-5 py-16 lg:grid-cols-[1fr_0.88fr] lg:px-12">
          <div className="home-hero-surface absolute inset-0" />
          <HeroField />
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
            {visual}
          </div>
        </section>

        {lead}

        {/* What the track is made of: three cards. Not a sequence, so no numbers. */}
        <section className="coms-sec coms-sec-top">
          <div className="coms-sec-inner">
            <div className="detail-head">
              <h2 data-reveal className="coms-title">{cardsTitle}</h2>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {cards.map(({ title: cardTitle, eyebrow: cardEyebrow, body: cardBody, icon: Icon }, index) => (
                <div key={cardTitle} data-reveal style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties} className="h-full">
                  <article className="coms-card">
                    <span className="coms-icon"><Icon size={22} strokeWidth={2} /></span>
                    <p className="coms-card-eyebrow mt-6">{cardEyebrow}</p>
                    <h3 className="coms-card-title">{cardTitle}</h3>
                    <p className="coms-card-body">{cardBody}</p>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it runs: the steps down one line. Numbered because the order is the point. */}
        {flow && flow.length > 0 && (
          <section className="coms-sec coms-sec-left">
            <div className="coms-sec-inner">
              <div className="detail-head">
                <h2 data-reveal className="coms-title">{flowTitle}</h2>
              </div>
              <ol className="coms-timeline">
                {flow.map(([number, stepTitle, stepBody], index) => (
                  <li key={number} data-reveal style={{ '--reveal-delay': `${index * 80}ms` } as React.CSSProperties}>
                    <span className="coms-timeline-num">{number}</span>
                    <div className="coms-timeline-card">
                      <h3 className="coms-card-title">{stepTitle}</h3>
                      <p className="coms-card-body">{stepBody}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* What it leaves behind: one lit panel */}
        <section className="coms-sec coms-sec-low">
          <div className="coms-sec-inner">
            <div className="coms-cta coms-split">
              <div>
                <h2 data-reveal className="coms-title mt-0">{outputsTitle}</h2>
                {outputsBody && <p data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties} className="coms-lede">{outputsBody}</p>}
              </div>
              <ul className="coms-checklist">
                {outputs.map((item, index) => (
                  <li key={item} data-reveal style={{ '--reveal-delay': `${index * 70}ms` } as React.CSSProperties}>
                    <span className="coms-checklist-mark"><Check size={15} strokeWidth={3} /></span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export function ActivitiesDetailPage() {
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
      visual={<LearningStackVisual title="Learning Stack" subtitle="Seminar · Study · Review" rows={['정기 세미나', '분야별 스터디', '코드 리뷰']} />}
      cardsTitle="정기 세미나, 스터디, 코드 리뷰."
      cards={activitiesDetailCards}
      flowTitle="배운 것이 프로젝트가 되기까지."
      flow={activitiesDetailFlow}
      outputsTitle="활동에서 다루는 주제."
      outputsBody="웹 개발과 프로그래밍 기초부터 임베디드, 협업 도구, 대회 준비까지 다룹니다."
      outputs={activitiesDetailTopics}
      lead={<ActivityTimeline />}
      className="activities-page"
    />
  )
}

export function ActivityLogPage() {
  return <ActivityLogSection />
}

export function ClubEventPage() {
  return <ClubEventSection />
}

export function MonthlyCalendarPage() {
  return <ClubCalendarSection />
}

export function AppsPage() {
  return <CompanionServicesSection />
}

export function ProjectsDetailPage() {
  return (
    <DetailStoryPage
      eyebrow="Projects"
      title="아이디어를 실제 서비스와 제작물로."
      body="COM's의 프로젝트는 동아리 안에서 쓰이는 서비스, 교육용 실습, 웹 개발 결과물처럼 실제로 동작하는 결과물을 만드는 데 집중합니다. 기획부터 구현, 배포와 개선까지 팀으로 경험합니다."
      visual={<ProjectLabVisual title="Project Lab" subtitle="Prototype · Launch · Iterate" rows={['서비스 기획', '팀 구현', '배포와 개선']} />}
      cardsTitle="동아리가 직접 만드는 프로젝트."
      cards={projectsDetailCards}
      flowTitle="문제를 정하고 계속 개선하기까지."
      flow={projectsDetailFlow}
      outputsTitle="프로젝트가 남기는 결과물."
      outputs={projectsDetailOutputs}
    />
  )
}
