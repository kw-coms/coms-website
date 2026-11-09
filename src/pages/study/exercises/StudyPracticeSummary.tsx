import { Link } from 'react-router-dom'
import { exercisesFor } from './problems'
import { useProgress } from './progress'
import './exercises.css'

/** The practice block inside a study card on the hub: counts, a progress bar and the way back to the last problem. */
export default function StudyPracticeSummary({ studyId }: { studyId: string }) {
  const progress = useProgress()
  const problems = exercisesFor(studyId)
  const solved = problems.filter((p) => progress[p.id]?.solved).length
  const latest = problems.filter((p) => progress[p.id]?.lastAt).sort((a, b) => progress[b.id].lastAt - progress[a.id].lastAt)[0]
  const counted = studyId !== 'arduino'
  return <div className="ex-hub-summary">
    <Link to={`/study/${studyId}/practice`} className="ex-hub-count">{counted ? `문제 ${problems.length}개 · 해결 ${solved}개` : 'Circuit Lab 미션 10개'} →</Link>
    {counted && problems.length > 0 && <span className="ex-hub-bar" role="img" aria-label={`${problems.length}문제 중 ${solved}문제 해결`}><i style={{ width: `${Math.round((solved / problems.length) * 100)}%` }} /></span>}
    {latest ? <Link to={`/study/${studyId}/practice/${latest.id}`} className="ex-hub-resume">이어서 풀기: {latest.title}</Link> : <span className="ex-hub-empty">아직 푼 문제가 없어요</span>}
  </div>
}
