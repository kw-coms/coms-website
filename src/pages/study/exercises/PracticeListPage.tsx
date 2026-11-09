import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import NotFoundPage from '../../../components/NotFoundPage'
import { findStudy } from '../studies'
import { exercisesFor } from './problems'
import { useProgress } from './progress'
import { labMissions, missionUrl } from './labMissions'
import { chapterOf, chapters, problemStatus, recommendProblem } from './navigation'
import '../study.css'
import './exercises.css'

const LANG_LABEL: Record<string, string> = { c: 'C', java: 'Java', python: 'Python' }
type Entry = { solved: boolean; tries: number; viewed?: boolean } | undefined
/** Pill for a row: unsolved problems get none. problemStatus() keeps its raw strings for the status filter. */
function stateOf(entry: Entry) {
  if (entry?.solved) return { key: 'solved', label: '✓ 해결' }
  if (entry?.viewed) return { key: 'viewed', label: '답 확인' }
  if (entry?.tries) return { key: 'trying', label: '시도 중' }
  return null
}

function Dots({ level }: { level: number }) {
  return <span className="ex-dots" role="img" aria-label={`난이도 ${level} / 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} data-on={n <= level || undefined} />)}</span>
}

export default function PracticeListPage() {
  const { id = '' } = useParams()
  const study = findStudy(id)
  const progress = useProgress()
  const [searchParams, setSearchParams] = useSearchParams()
  const chapter = searchParams.get('chapter') ?? ''
  const setChapter = (value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('chapter', value)
      else next.delete('chapter')
      return next
    })
  }
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState('')
  const [status, setStatus] = useState('')
  if (!study) return <NotFoundPage />
  const problems = exercisesFor(id)
  const solved = problems.filter((p) => progress[p.id]?.solved).length
  let completed: string[] = []
  try { completed = Object.entries(JSON.parse(localStorage.getItem(study.progressKey) || '{}')).filter(([, value]) => value === true).map(([key]) => key) } catch { /* unavailable storage */ }
  const next = recommendProblem(problems, id, progress, completed)
  const topics = [...new Set(problems.flatMap((p) => p.topics))]
  const mixedLangs = new Set(problems.map((p) => ('langs' in p ? p.langs.join('/') : 'web'))).size > 1
  const visible = problems.filter((p) => (!chapter || chapterOf(p, id) === chapter) && (!topic || p.topics.includes(topic)) && (!level || p.level === Number(level)) && (!status || problemStatus(progress[p.id]) === status))
  return <div className="study-page ex-page"><div className="ex-container">
    <Link to={`/study/${id}`}>← {study.title} 자료</Link>
    <header className="ex-head"><div className="ex-head-copy"><h1>{study.title} 실습 문제</h1>
      <p>{id === 'arduino' ? 'Circuit Lab에서 회로를 만들고 미션에 도전해 보세요.' : '직접 코드를 작성하고, 테스트를 통과하며 한 걸음씩 익혀 보세요.'}</p></div>
      {id !== 'arduino' && <div className="ex-progress"><label htmlFor="exercise-progress"><b>{solved}</b> / {problems.length} 해결</label><progress id="exercise-progress" value={solved} max={problems.length || 1} /></div>}
    </header>
    {id === 'arduino' ? <ul className="ex-list">{labMissions.map((mission) => <li key={mission.id}><a className="ex-row" href={missionUrl(mission.id)}><strong>{mission.title}</strong><Dots level={mission.level} /><span className="ex-go">Circuit Lab →</span></a></li>)}</ul> : <>
      {next && <aside className="ex-recommend"><p>다음 문제 추천</p><Link to={`/study/${id}/practice/${next.id}`}><strong>{next.title}</strong> · 난이도 {next.level} →</Link></aside>}
      <div className="ex-filters" aria-label="문제 필터">
        <label>장<select value={chapter} onChange={(e) => setChapter(e.target.value)}><option value="">전체 장</option>{(chapters[id] ?? []).filter((c) => problems.some((p) => chapterOf(p, id) === c)).map((c) => <option key={c} value={c}>{chapters[id].indexOf(c) + 1}장 · {c}</option>)}</select></label>
        <label>주제<select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">전체 주제</option>{topics.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>난이도<select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">전체 난이도</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>상태<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">전체 상태</option>{['new', '◐ 도전 중', '👀 답 확인', '✓ 해결'].map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      {chapter && <button type="button" className="ex-filter-chip" onClick={() => setChapter('')} aria-label={`장 필터 해제: ${chapter}`}>장: {chapter} ×</button>}
      <p role="status">{visible.length}개 문제</p>
      <ul className="ex-list"><li className="ex-list-head" aria-hidden="true"><span>문제</span><span>난이도</span><span>주제</span>{mixedLangs && <span>언어</span>}<span>상태</span></li>{visible.map((p) => { const state = stateOf(progress[p.id]); return <li key={p.id}><Link className="ex-row" data-lang={mixedLangs || undefined} to={`/study/${id}/practice/${p.id}`}><strong>{p.title}</strong><Dots level={p.level} /><span className="ex-topics">{p.topics.join(' · ')}</span>{mixedLangs && <span className="ex-lang">{('langs' in p ? p.langs.map((l) => LANG_LABEL[l] ?? l) : ['HTML', 'CSS', 'JS']).join(' / ')}</span>}<span className="ex-state" data-state={state?.key}>{state?.label}</span></Link></li> })}</ul>
      {visible.length === 0 && <p className="ex-empty">{problems.length ? '조건에 맞는 문제가 없어요. 필터를 바꿔 보세요.' : '실습 문제를 준비하고 있어요.'}</p>}
      {problems.length > 0 && <details className="ex-stats"><summary>주제·난이도별 진행 상황</summary><ul>{topics.map((t) => { const group = problems.filter((p) => p.topics.includes(t)); return <li key={t}>{t}: {group.filter((p) => progress[p.id]?.solved).length} / {group.length}</li> })}{[1, 2, 3, 4, 5].map((n) => { const group = problems.filter((p) => p.level === n); return <li key={n}>난이도 {n}: {group.filter((p) => progress[p.id]?.solved).length} / {group.length}</li> })}</ul></details>}
    </>}
  </div></div>
}
