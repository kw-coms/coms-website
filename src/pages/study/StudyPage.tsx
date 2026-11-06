import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import NotFoundPage from '../../components/NotFoundPage'
import { findStudy } from './studies'
import { loadStudyHtml } from './studyContent'
import { initStudyPage } from './studyDemos'
import './study.css'

function StudyBody({ id }: { id: string }) {
  const study = findStudy(id)!
  // Markup per study id; null while the (lazy) fragment is loading or failed.
  const [loaded, setLoaded] = useState<{ id: string; html: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const layoutRef = useRef<HTMLDivElement>(null)
  const html = loaded?.id === id ? loaded.html : null

  useEffect(() => {
    let cancelled = false
    loadStudyHtml(id).then(
      (html) => { if (!cancelled) setLoaded({ id, html }) },
      () => { if (!cancelled) setFailed(true) },
    )
    return () => { cancelled = true }
  }, [id])

  useEffect(() => (html && layoutRef.current ? initStudyPage(layoutRef.current, study.progressKey) : undefined), [html, study.progressKey])

  return (
    <div className="study-page">
      <div className="study-back">
        <Link to="/study"><ArrowLeft size={14} aria-hidden="true" /> 스터디 목록</Link>
      </div>
      {html ? (
        // Trusted build-time constant (src/pages/study/content/*.html), not user content. React never re-renders it.
        <div ref={layoutRef} className="study-layout" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="study-loading" role="status">{failed ? '자료를 불러오지 못했습니다. 새로고침해 주세요.' : '불러오는 중...'}</p>
      )}
    </div>
  )
}

export default function StudyPage() {
  const { id } = useParams()
  if (!findStudy(id)) return <NotFoundPage />
  return <StudyBody key={id} id={id!} />
}
