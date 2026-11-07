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
              <li key={study.id}>
                <Link to={`/study/${study.id}`} className="study-card">
                  <span className="study-card-sub">{study.subtitle}</span>
                  <span className="study-card-title">{study.title}</span>
                  <span className="study-card-desc">{study.description}</span>
                  <span className="study-card-tags">{study.tags.map((tag) => <span key={tag}>{tag}</span>)}</span>
                  <span className="study-card-foot">
                    <span>{done > 0 ? `진도 ${done}개 완료` : '시작하기'}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </Link>
                <Suspense fallback={<div style={{ minHeight: 80 }} />}><StudyPracticeSummary studyId={study.id} /></Suspense>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
