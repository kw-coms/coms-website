import { Link } from 'react-router-dom'
import { exercisesFor } from './problems'
import { useProgress } from './progress'
import './exercises.css'

export default function StudyPracticeSummary({ studyId }: { studyId: string }) {
  const progress = useProgress()
  const problems = exercisesFor(studyId)
  const solved = problems.filter((p) => progress[p.id]?.solved).length
  const latest = problems.filter((p) => progress[p.id]?.lastAt).sort((a, b) => progress[b.id].lastAt - progress[a.id].lastAt)[0]
  return <div className="ex-hub-summary"><Link to={`/study/${studyId}/practice`}>{studyId === 'arduino' ? 'Circuit Lab 미션 10개' : `문제 ${problems.length}개 · 해결 ${solved}개`} →</Link>
    {latest && <Link to={`/study/${studyId}/practice/${latest.id}`}>이어서 풀기: {latest.title}</Link>}
  </div>
}
