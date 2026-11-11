import PageHeading from '../../components/PageHeading'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import NotFoundPage from '../../components/NotFoundPage'
import { findStudy } from './studies'
import { loadStudyChapters, loadStudyHtml } from './studyContent'
import { useAuth } from '../../contexts/useAuth'
import { useCineReveal } from '../../hooks/useSceneProgress'
import MembersGate, { AuthCheckFailed } from '../../components/MembersGate'
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
  useCineReveal(html)
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

  // A link from quick search (/study/c#pointer) arrives before the lesson markup exists, so the browser cannot scroll to it.
  useEffect(() => {
    if (!html || !location.hash || /^#(code-\d+|pg=)/.test(location.hash)) return
    // A hand-typed hash such as "#%E0%A4%A" is not valid percent-encoding: decodeURIComponent throws. Look the id up as written then.
    let anchor = location.hash.slice(1)
    try {
      anchor = decodeURIComponent(anchor)
    } catch {
      // Not decodable.
    }
    const go = () => document.getElementById(anchor)?.scrollIntoView()
    // A frame later: the route's scroll-to-top effect runs after this one when the lesson is already cached.
    const frame = requestAnimationFrame(go)
    // The playgrounds and code blocks above the chapter are built after the markup lands and push it down.
    // Keep the chapter in place while the page settles, and stop the moment the reader takes over.
    const layout = layoutRef.current
    const settle = typeof ResizeObserver === 'undefined' || !layout ? null : new ResizeObserver(go)
    const stop = () => {
      settle?.disconnect()
      window.clearTimeout(limit)
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.removeEventListener(type, stop)
    }
    const limit = window.setTimeout(stop, 3000)
    if (layout) settle?.observe(layout)
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.addEventListener(type, stop, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      stop()
    }
  }, [html, location.hash])

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
    <div className="study-page cine-root">
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

/** A guest sees the subject and its chapter titles; the lesson itself stays out of the page. */
function StudyGuest({ id }: { id: string }) {
  const study = findStudy(id)!
  const [chapters, setChapters] = useState<string[] | null>(null)
  useEffect(() => {
    let cancelled = false
    loadStudyChapters(id).then((titles) => { if (!cancelled) setChapters(titles) }, () => { if (!cancelled) setChapters([]) })
    return () => { cancelled = true }
  }, [id])
  return (
    <div className="study-page">
      <div className="study-back">
        <Link to="/study"><ArrowLeft size={14} aria-hidden="true" /> 스터디 목록</Link>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <PageHeading className="text-3xl font-bold text-[var(--app-text)]">{study.title}</PageHeading>
        <p className="mt-1 text-sm text-[var(--app-muted)]">{study.subtitle}</p>
        {chapters && chapters.length > 0 && (
          <ol aria-label="목차" className="mt-6 list-none space-y-1.5 p-0">
            {chapters.map((title, i) => <li key={`${i}-${title}`} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[var(--app-text)]">{title}</li>)}
          </ol>
        )}
        <MembersGate heading="h2" title="강의 본문은 동아리원만 볼 수 있어요">로그인하면 강의 본문과 예제, 실습 문제를 볼 수 있어요.</MembersGate>
      </div>
    </div>
  )
}

export default function StudyPage() {
  const { id } = useParams()
  const { user, loading, authError } = useAuth()
  if (!findStudy(id)) return <NotFoundPage />
  if (loading) return <div className="study-page"><p className="study-loading" role="status">불러오는 중...</p></div>
  // ponytail: UI-only gate. The lesson HTML is still in the public JS bundle (studyContent.ts globs it), so a guest who reads the
  // bundle can see it. Upgrade path: serve lessons from an authenticated API instead of import.meta.glob.
  if (!user && authError) return <div className="study-page"><AuthCheckFailed /></div>
  if (!user) return <StudyGuest key={id} id={id!} />
  return <StudyBody key={id} id={id!} />
}
