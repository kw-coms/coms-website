import { Link } from 'react-router-dom'
import { ListChecks, Play } from 'lucide-react'
import { STUDIES } from '../studies'
import { exercisesFor } from './problems'
import { labMissions } from './labMissions'
import { useProgress } from './progress'
import './exercises.css'

/** Practice block inside a study card on the hub: one quiet link to the problems, progress only once something is solved, and the way back to the last problem. */
export default function StudyPracticeSummary({ studyId, reserveResume }: { studyId: string; reserveResume: boolean }) {
  const progress = useProgress()
  const problems = exercisesFor(studyId)
  const solved = problems.filter((p) => progress[p.id]?.solved).length
  const latest = problems.filter((p) => progress[p.id]?.lastAt).sort((a, b) => progress[b.id].lastAt - progress[a.id].lastAt)[0]
  const counted = studyId !== 'arduino'
  return <div className="ex-hub-summary" data-reserve={reserveResume || undefined}>
    <div className="ex-hub-row">
      <Link to={`/study/${studyId}/practice`} className="ex-hub-count">
        <ListChecks size={15} aria-hidden="true" />
        {counted ? (solved > 0 ? `연습 문제 ${solved}/${problems.length}` : `연습 문제 ${problems.length}개`) : `Circuit Lab 미션 ${labMissions.length}개`}
      </Link>
      {counted && solved > 0 && <span className="ex-hub-bar" role="img" aria-label={`${problems.length}문제 중 ${solved}문제 해결`}><i style={{ width: `${Math.round((solved / problems.length) * 100)}%` }} /></span>}
    </div>
    {latest && <Link to={`/study/${studyId}/practice/${latest.id}`} className="ex-hub-resume"><Play size={12} aria-hidden="true" /><span>이어서 풀기: {latest.title}</span></Link>}
  </div>
}

/** Header summary: real totals, plus a way back to the problem worked on last (any subject). */
export function StudyHubOverview({ reserveResume }: { reserveResume: boolean }) {
  const progress = useProgress()
  let total = 0
  let solved = 0
  let last: { studyId: string; studyTitle: string; id: string; title: string; at: number } | null = null
  for (const study of STUDIES) {
    for (const p of exercisesFor(study.id)) {
      total += 1
      const entry = progress[p.id]
      if (entry?.solved) solved += 1
      if (entry?.lastAt && (!last || entry.lastAt > last.at)) last = { studyId: study.id, studyTitle: study.title, id: p.id, title: p.title, at: entry.lastAt }
    }
  }
  return <div className="study-overview" data-reserve={reserveResume || undefined}>
    <dl className="study-overview-stats">
      <div><dt>연습 문제</dt><dd>{total}</dd></div>
      <div><dt>Lab 미션</dt><dd>{labMissions.length}</dd></div>
      <div><dt>내가 푼 문제</dt><dd>{solved}</dd></div>
    </dl>
    {last && <Link to={`/study/${last.studyId}/practice/${last.id}`} className="study-overview-resume"><Play size={13} aria-hidden="true" /><span><b>이어서 풀기</b> {last.studyTitle} · {last.title}</span></Link>}
  </div>
}
