import { lazy, Suspense, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircuitBoard, Coffee } from 'lucide-react'
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

/** Problem id prefix -> studies it belongs to (the shared "core-" problems are offered in three). Kept here so the hub can tell, without loading the problem lists, which cards will show a resume link. */
const ID_PREFIX_STUDIES: Array<[string, string[]]> = [['web-', ['web']], ['c-', ['c']], ['java-', ['java']], ['py-', ['python']], ['core-', ['c', 'java', 'python']]]

/** Studies with a last-worked-on problem in saved progress; the Arduino card never has one. */
function studiesWithResume() {
  const ids = new Set<string>()
  for (const [id, entry] of Object.entries(readProgress())) {
    if (!(entry.lastAt > 0)) continue
    for (const [prefix, studies] of ID_PREFIX_STUDIES) if (id.startsWith(prefix)) studies.forEach((study) => ids.add(study))
  }
  return ids
}

export default function StudyHubPage() {
  // Decided before the lazy summaries arrive, so each card reserves its "이어서 풀기" row only when it will be shown.
  const resumable = studiesWithResume()
  const hasProgress = resumable.size > 0
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
                    <h2 className="study-card-title"><Link to={`/study/${study.id}`} className="study-card-link">{study.title}</Link></h2>
                    <span className="study-card-sub">{study.subtitle}</span>
                  </span>
                </span>
                <ArrowRight className="study-card-go" size={16} aria-hidden="true" />
                <span className="study-card-desc">{study.description}</span>
                {done > 0 && <span className="study-card-done">강의 {done}개 완료</span>}
                <Suspense fallback={<div className="ex-hub-summary" data-reserve={resumable.has(study.id) || undefined} aria-hidden="true" />}><StudyPracticeSummary studyId={study.id} reserveResume={resumable.has(study.id)} /></Suspense>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
