import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import NotFoundPage from '../../components/NotFoundPage'
import { findStudy } from './studies'
import { loadStudyHtml } from './studyContent'
import { initStudyPage } from './studyDemos'
import { initPlayground } from './playground'
import type { PageLang } from './playground/classify'
import './study.css'
import './exercises/exercises.css'
import './playground/playground.css'

function StudyBody({ id }: { id: string }) {
  const study = findStudy(id)!
  // Markup per study id; null while the (lazy) fragment is loading or failed.
  const [loaded, setLoaded] = useState<{ id: string; html: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const layoutRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const html = loaded?.id === id ? loaded.html : null
  // A fresh { __html } object on every render makes React 19 assign innerHTML again, which would wipe what initStudyPage added (demos, circuits).
  const markup = useMemo(() => (html ? { __html: html } : null), [html])

  useEffect(() => {
    let cancelled = false
    loadStudyHtml(id).then(
      (html) => { if (!cancelled) setLoaded({ id, html }) },
      () => { if (!cancelled) setFailed(true) },
    )
    return () => { cancelled = true }
  }, [id])

  useEffect(() => (html && layoutRef.current ? initStudyPage(layoutRef.current, study.progressKey) : undefined), [html, study.progressKey])

  // The playground calls the latest login handler without being re-created when the router state changes.
  const goLogin = useRef<(hash: string) => void>(() => {})
  useEffect(() => {
    goLogin.current = (hash) => navigate('/login', { state: { from: { pathname: location.pathname, search: location.search, hash } } })
  })

  // "직접 해보기": editors, runners and per-block saves for the code blocks. The login redirect returns to the same block.
  useEffect(() => (html && layoutRef.current ? initPlayground(layoutRef.current, { pageId: id as PageLang, onLogin: (hash) => goLogin.current(hash) }) : undefined), [html, id])

  useEffect(() => {
    if (!html || !layoutRef.current) return
    let disposed = false
    let cleanup: (() => void) | undefined
    const root = layoutRef.current
    void import('./exercises/inline').then(({ initExerciseLinks }) => {
      if (!disposed) cleanup = initExerciseLinks(root, id, navigate)
    })
    return () => { disposed = true; cleanup?.() }
  }, [html, id, navigate])

  return (
    <div className="study-page">
      <div className="study-back">
        <Link to="/study"><ArrowLeft size={14} aria-hidden="true" /> 스터디 목록</Link>
      </div>
      {markup ? (
        // Trusted build-time constant (src/pages/study/content/*.html), not user content. React never re-renders it.
        <div ref={layoutRef} className="study-layout" dangerouslySetInnerHTML={markup} />
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
