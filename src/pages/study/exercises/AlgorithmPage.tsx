import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, CalendarRange } from 'lucide-react'
import { Link } from 'react-router-dom'
import MemberLock from '../../../components/MemberLock'
import PageHeading from '../../../components/PageHeading'
import { algorithmChallenges, algorithmProblems } from './algorithmChallenges'
import Dots from './Dots'
import { problemStatus } from './navigation'
import { useProgress } from './progress'
import '../study.css'
import './exercises.css'

const problemPath = (id: string) => `/study/python/practice/${id}?from=algorithms`

export default function AlgorithmPage() {
  const [now, setNow] = useState(Date.now)
  const { daily, weekly, nextMidnight } = algorithmChallenges(now)
  const progress = useProgress()
  const solved = algorithmProblems.filter((problem) => progress[problem.id]?.solved).length

  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = window.setTimeout(refresh, Math.max(0, nextMidnight - Date.now()))
    window.addEventListener('focus', refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [nextMidnight])

  return <main className="study-page ex-page">
    <div className="ex-container">
      <Link to="/study">← 스터디 자료</Link>
      <header className="ex-head">
        <div className="ex-head-copy">
          <PageHeading>알고리즘 문제</PageHeading>
          <p>C, Java, Python으로 풀고 바로 채점해 보세요. 해결 기록은 이 브라우저에 저장됩니다.</p>
        </div>
        <div className="ex-progress">
          <label htmlFor="algorithm-progress"><b>{solved}</b> / {algorithmProblems.length} 해결</label>
          <progress id="algorithm-progress" value={solved} max={algorithmProblems.length} />
        </div>
      </header>
      <div className="algorithm-challenges">
        {[
          { id: 'daily', label: '오늘의 문제', icon: CalendarDays, ...daily },
          { id: 'weekly', label: '주간 문제', icon: CalendarRange, ...weekly },
        ].map(({ id, label, icon: Icon, problem, dates }) => {
          const entry = progress[problem.id]
          return <section key={id} className="ex-panel algorithm-challenge" aria-labelledby={`algorithm-${id}`}>
            <div className="algorithm-card-head">
              <h2 id={`algorithm-${id}`}><Icon size={17} aria-hidden="true" />{label}</h2>
              <span>{dates}</span>
            </div>
            <h3>{problem.title}</h3>
            <div className="ex-meta"><Dots level={problem.level} /><span>{problem.topics.join(' · ')}</span></div>
            <div className="algorithm-card-foot">
              <Link to={problemPath(problem.id)}>{entry?.solved ? '다시 풀기' : '문제 풀기'} <MemberLock /><ArrowRight size={16} aria-hidden="true" /></Link>
              {entry?.solved && <span className="ex-badge" data-state="solved">해결 완료</span>}
            </div>
          </section>
        })}
      </div>
      <p className="algorithm-schedule">한국 시간 기준 매일 자정과 매주 월요일에 새 과제가 열립니다.</p>
      <section aria-labelledby="algorithm-list">
        <h2 id="algorithm-list">전체 알고리즘 문제</h2>
        <ul className="ex-list">
          <li className="ex-list-head" aria-hidden="true"><span>문제</span><span>난이도</span><span>주제</span><span>상태</span></li>
          {algorithmProblems.map((problem) => {
            const entry = progress[problem.id]
            const status = problemStatus(entry)
            return <li key={problem.id}>
              <Link className="ex-row" to={problemPath(problem.id)}>
                <strong>{problem.title} <MemberLock /></strong>
                <Dots level={problem.level} />
                <span className="ex-topics">{problem.topics.join(' · ')}</span>
                <span className="ex-state" data-state={entry?.solved ? 'solved' : status === 'new' ? 'new' : 'trying'}>{status === 'new' ? '미시도' : status}</span>
              </Link>
            </li>
          })}
        </ul>
      </section>
    </div>
  </main>
}
