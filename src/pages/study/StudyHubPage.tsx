import { lazy, Suspense, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CircuitBoard, Coffee, Zap } from 'lucide-react'
import { STUDIES } from './studies'
import { readProgress } from './exercises/progress'
import './study.css'

const StudyPracticeSummary = lazy(() => import('./exercises/StudyPracticeSummary'))
const StudyHubOverview = lazy(() => import('./exercises/StudyPracticeSummary').then((m) => ({ default: m.StudyHubOverview })))

/** One mark per subject: a glyph on a tile, so the six cards are told apart at a glance. */
const GLYPHS: Record<string, ReactNode> = {
  web: <span className="study-glyph-text">&lt;/&gt;</span>,
  arduino: <CircuitBoard size={22} strokeWidth={2} />,
  c: <span className="study-glyph-text study-glyph-big">C</span>,
  java: <Coffee size={22} strokeWidth={2} />,
  python: <span className="study-glyph-text">Py</span>,
}

/** Number of finished parts saved for a study, or 0 (also when storage is unavailable). */
function savedDone(progressKey: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) || '{}')
    return saved && typeof saved === 'object' ? Object.values(saved).filter(Boolean).length : 0
  } catch {
    return 0
  }
}

export default function StudyHubPage() {
  // Saved practice progress decides, before the lazy summary arrives, how much room each card reserves for it.
  const hasProgress = Object.keys(readProgress()).length > 0
  return (
    <div className="study-hub">
      <div className="study-hub-inner">
        <div className="study-hub-head">
          <div className="study-hub-title">
            <h1>스터디 자료</h1>
            <p className="study-hub-lead">관심 있는 주제를 골라 순서대로 따라와 보세요. 진도는 이 브라우저에 저장됩니다.</p>
          </div>
          <Suspense fallback={<div className="study-overview" data-reserve={hasProgress || undefined} aria-hidden="true" />}><StudyHubOverview reserveResume={hasProgress} /></Suspense>
        </div>
        <ul className="study-hub-grid">
          {STUDIES.map((study) => {
            const done = savedDone(study.progressKey)
            return (
              <li key={study.id} className="study-card">
                {/* One card, several links: the title link is stretched over the card (::after), the practice links sit above it. */}
                <span className="study-card-head">
                  <span className="study-tile" aria-hidden="true">{GLYPHS[study.id]}</span>
                  <span className="study-card-titles">
                    <Link to={`/study/${study.id}`} className="study-card-title study-card-link">{study.title}</Link>
                    <span className="study-card-sub">{study.subtitle}</span>
                  </span>
                </span>
                <ArrowRight className="study-card-go" size={16} aria-hidden="true" />
                <span className="study-card-desc">{study.description}</span>
                {done > 0 && <span className="study-card-done">강의 {done}개 완료</span>}
                <Suspense fallback={<div className="ex-hub-summary" data-reserve={hasProgress || undefined} aria-hidden="true" />}><StudyPracticeSummary studyId={study.id} reserveResume={hasProgress} /></Suspense>
              </li>
            )
          })}
          <li className="study-hub-lab">
            {/* /lab/ is a separate app, not a router page: a plain link makes the browser load it. The card has no other link, so the whole card is the anchor. */}
            <a href="/lab/" className="study-card study-card-lab">
              <span className="study-lab-copy">
                <span className="study-card-head">
                  <span className="study-tile study-tile-lab" aria-hidden="true"><Zap size={22} strokeWidth={2} /></span>
                  <span className="study-card-titles">
                    <span className="study-card-title">Circuit Lab</span>
                    <span className="study-card-sub">Arduino 시뮬레이터</span>
                  </span>
                </span>
                <span className="study-card-desc">브라우저에서 아두이노 회로를 만들고 코드를 바로 돌려 보세요</span>
                <span className="study-lab-open">Circuit Lab 열기<ArrowUpRight size={16} aria-hidden="true" /></span>
              </span>
              <svg className="study-lab-art" viewBox="0 0 330 150" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* D13 -> resistor -> LED -> back to GND; current dashes run along the wire, the LED glows. */}
                <circle cx="245" cy="62" r="44" className="study-lab-glow" stroke="none" />
                <path d="M30 62H84l8-13 12 26 12-26 12 26 12-26 8 13H160M160 62H224M224 44V80L254 62Z" className="study-lab-part" />
                <path d="M258 44V80M258 62H300V120H30" />
                <path d="M236 28l9-9M250 33l9-9" />
                <path className="study-lab-flow" d="M30 62H84M160 62H224M258 62H300V120H30" strokeDasharray="3 11" strokeWidth="3.5" />
                <circle cx="26" cy="62" r="5" fill="var(--app-surface)" />
                <circle cx="26" cy="120" r="5" fill="var(--app-surface)" />
              </svg>
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}
