import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { STUDIES } from './studies'
import './study.css'

const StudyPracticeSummary = lazy(() => import('./exercises/StudyPracticeSummary'))

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
  return (
    <div className="study-hub">
      <div className="study-hub-inner">
        <p className="study-hub-eyebrow">COM&apos;S STUDY</p>
        <h1>스터디 자료</h1>
        <p className="study-hub-lead">관심 있는 주제를 골라 순서대로 따라와 보세요. 진도는 이 브라우저에 저장됩니다.</p>
        <ul className="study-hub-grid">
          {STUDIES.map((study) => {
            const done = savedDone(study.progressKey)
            return (
              <li key={study.id} className="study-card">
                {/* One card, several links: the title link is stretched over the card (::after), the practice links sit above it. */}
                <span className="study-card-sub">{study.subtitle}</span>
                <Link to={`/study/${study.id}`} className="study-card-title study-card-link">{study.title}</Link>
                <span className="study-card-desc">{study.description}</span>
                <span className="study-card-tags">{study.tags.map((tag) => <span key={tag}>{tag}</span>)}</span>
                <Suspense fallback={<div className="ex-hub-summary" aria-hidden="true" />}><StudyPracticeSummary studyId={study.id} /></Suspense>
                <span className="study-card-foot">
                  <span>{done > 0 ? `진도 ${done}개 완료` : '시작하기'}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </span>
              </li>
            )
          })}
          <li>
            {/* /lab/ is a separate app, not a router page: a plain link makes the browser load it. The card has no other link, so the whole card is the anchor. */}
            <a href="/lab/" className="study-card study-card-lab">
              <svg className="study-lab-art" viewBox="0 0 240 80" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 40h30M50 26v28M62 32v16M62 40h28" />
                <path d="M90 40l6-10 10 20 10-20 10 20 6-10h18" />
                <path d="M150 40h14M164 26l22 14-22 14zM186 26v28M186 40h34" />
                <path d="M20 40v26h200V40" />
                <path d="M196 18l8-8M206 24l8-8" />
              </svg>
              <span className="study-card-sub">Arduino 시뮬레이터</span>
              <span className="study-card-title">Circuit Lab</span>
              <span className="study-card-desc">브라우저에서 아두이노 회로를 만들고 코드를 바로 돌려 보세요</span>
              <span className="study-card-foot">
                <span>Circuit Lab 열기</span>
                <ArrowRight size={15} aria-hidden="true" />
              </span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}
