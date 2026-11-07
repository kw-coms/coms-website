import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import NotFoundPage from '../../../components/NotFoundPage'
import { findStudy } from '../studies'
import { exercisesFor } from './problems'
import { useProgress } from './progress'
import { labMissions, missionUrl } from './labMissions'
import { chapterOf, chapters, problemStatus, recommendProblem } from './navigation'
import '../study.css'
import './exercises.css'

export default function PracticeListPage() {
  const { id = '' } = useParams()
  const study = findStudy(id)
  const progress = useProgress()
  const [chapter, setChapter] = useState('')
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
  const visible = problems.filter((p) => (!chapter || chapterOf(p, id) === chapter) && (!topic || p.topics.includes(topic)) && (!level || p.level === Number(level)) && (!status || problemStatus(progress[p.id]) === status))
  return <div className="study-page ex-page"><div className="ex-container">
    <Link to={`/study/${id}`}>← {study.title} 자료</Link>
    <header className="ex-head"><p>COM&apos;S PRACTICE</p><h1>{study.title} 실습 문제</h1>
      <p>{id === 'arduino' ? 'Circuit Lab에서 회로를 만들고 미션에 도전해 보세요.' : '직접 코드를 작성하고, 테스트를 통과하며 한 걸음씩 익혀 보세요.'}</p>
      {id !== 'arduino' && <><label htmlFor="exercise-progress">해결 {solved} / {problems.length}</label><progress id="exercise-progress" value={solved} max={problems.length || 1} /></>}
    </header>
    {id === 'arduino' ? <ul className="ex-list">{labMissions.map((mission) => <li key={mission.id}><a className="ex-row" href={missionUrl(mission.id)}><strong>{mission.title}</strong><span aria-label={`난이도 ${mission.level} / 5`}>{'●'.repeat(mission.level)}{'○'.repeat(5 - mission.level)}</span><span>Circuit Lab →</span></a></li>)}</ul> : <>
      {next && <aside className="ex-recommend"><p>다음 문제 추천</p><Link to={`/study/${id}/practice/${next.id}`}><strong>{next.title}</strong> · 난이도 {next.level} →</Link></aside>}
      <div className="ex-filters" aria-label="문제 필터">
        <label>장<select value={chapter} onChange={(e) => setChapter(e.target.value)}><option value="">전체 장</option>{(chapters[id] ?? []).filter((c) => problems.some((p) => chapterOf(p, id) === c)).map((c) => <option key={c} value={c}>{chapters[id].indexOf(c) + 1}장 · {c}</option>)}</select></label>
        <label>주제<select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">전체 주제</option>{topics.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>난이도<select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">전체 난이도</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>상태<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">전체 상태</option>{['new', '◐ 도전 중', '👀 답 확인', '✓ 해결'].map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <p role="status">{visible.length}개 문제</p>
      <ul className="ex-list">{visible.map((p) => <li key={p.id}><Link className="ex-row" to={`/study/${id}/practice/${p.id}`}><strong>{p.title}</strong><span aria-label={`난이도 ${p.level} / 5`}>{'●'.repeat(p.level)}{'○'.repeat(5 - p.level)}</span><span>{p.topics.join(' · ')}</span><span>{problemStatus(progress[p.id])}</span><span>{'langs' in p ? p.langs.join(' / ') : 'HTML / CSS / JS'}</span></Link></li>)}</ul>
      {visible.length === 0 && <p className="ex-empty">{problems.length ? '조건에 맞는 문제가 없어요. 필터를 바꿔 보세요.' : '실습 문제를 준비하고 있어요.'}</p>}
      {problems.length > 0 && <details className="ex-stats"><summary>주제·난이도별 진행 상황</summary><ul>{topics.map((t) => { const group = problems.filter((p) => p.topics.includes(t)); return <li key={t}>{t}: {group.filter((p) => progress[p.id]?.solved).length} / {group.length}</li> })}{[1, 2, 3, 4, 5].map((n) => { const group = problems.filter((p) => p.level === n); return <li key={n}>난이도 {n}: {group.filter((p) => progress[p.id]?.solved).length} / {group.length}</li> })}</ul></details>}
    </>}
  </div></div>
}
