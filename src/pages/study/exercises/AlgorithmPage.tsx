import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, CalendarRange } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import MemberLock from '../../../components/MemberLock'
import PageHeading from '../../../components/PageHeading'
import { algorithmChallenges } from './algorithmChallenges'
import Dots from './Dots'
import { problemStatus } from './navigation'
import { numberedProblemNumber, numberedProblemPath } from './problemNumbers'
import { numberedExercises } from './problems'
import { useProgress } from './progress'
import '../study.css'
import './exercises.css'

const LANGUAGES = { c: 'C', java: 'Java', python: 'Python' } as const
const LEVELS = ['1', '2', '3', '4', '5']

export default function AlgorithmPage() {
  const [now, setNow] = useState(Date.now)
  const { daily, weekly, nextMidnight } = algorithmChallenges(now)
  const progress = useProgress()
  const [search, setSearch] = useSearchParams()
  const query = search.get('q') ?? ''
  const level = LEVELS.find((value) => value === search.get('level')) ?? ''
  const language = (['c', 'java', 'python'] as const).find((value) => value === search.get('lang')) ?? ''
  const status = (['solved', 'unsolved'] as const).find((value) => value === search.get('status')) ?? ''
  const term = query.trim().replace(/^#/, '').toLocaleLowerCase('ko-KR')
  const solved = numberedExercises.filter(({ problem }) => progress[problem.id]?.solved).length
  const visible = numberedExercises.filter(({ problem, number }) =>
    (!level || String(problem.level) === level) &&
    (!language || problem.langs.includes(language)) &&
    (!status || Boolean(progress[problem.id]?.solved) === (status === 'solved')) &&
    (!term || String(number).startsWith(term) || problem.title.toLocaleLowerCase('ko-KR').includes(term) ||
      problem.topics.some((topic) => topic.toLocaleLowerCase('ko-KR').includes(term))),
  )

  const filterBy = (key: 'q' | 'level' | 'lang' | 'status', value: string) => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

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
          <label htmlFor="algorithm-progress"><b>{solved}</b> / {numberedExercises.length} 해결</label>
          <progress id="algorithm-progress" value={solved} max={numberedExercises.length} />
        </div>
      </header>
      <div className="algorithm-challenges">
        {[
          { id: 'daily', label: '오늘의 문제', icon: CalendarDays, ...daily },
          { id: 'weekly', label: '주간 문제', icon: CalendarRange, ...weekly },
        ].map(({ id, label, icon: Icon, problem, dates }) => {
          const number = numberedProblemNumber(problem.id)
          const entry = progress[problem.id]
          if (number === undefined) return null
          return <section key={id} className="ex-panel algorithm-challenge" aria-labelledby={`algorithm-${id}`}>
            <div className="algorithm-card-head">
              <h2 id={`algorithm-${id}`}><Icon size={17} aria-hidden="true" />{label}</h2>
              <span>{dates}</span>
            </div>
            <h3><span className="algorithm-number">{number}번</span>{problem.title}</h3>
            <div className="ex-meta"><Dots level={problem.level} /><span>{problem.topics.join(' · ')}</span></div>
            <div className="algorithm-card-foot">
              <Link to={numberedProblemPath(number)}>{entry?.solved ? '다시 풀기' : '문제 풀기'} <MemberLock /><ArrowRight size={16} aria-hidden="true" /></Link>
              {entry?.solved && <span className="ex-badge" data-state="solved">해결 완료</span>}
            </div>
          </section>
        })}
      </div>
      <p className="algorithm-schedule">한국 시간 기준 매일 자정과 매주 월요일에 새 과제가 열립니다.</p>
      <section aria-labelledby="algorithm-list">
        <h2 id="algorithm-list">전체 알고리즘 문제</h2>
        <div className="ex-filters algorithm-filters" aria-label="알고리즘 문제 필터">
          <label>문제 검색<input type="search" value={query} onChange={(event) => filterBy('q', event.target.value)} placeholder="문제 번호, 제목, 주제" /></label>
          <label>난이도<select value={level} onChange={(event) => filterBy('level', event.target.value)}>
            <option value="">전체 난이도</option>
            {LEVELS.map((value) => <option key={value}>{value}</option>)}
          </select></label>
          <label>언어<select value={language} onChange={(event) => filterBy('lang', event.target.value)}>
            <option value="">전체 언어</option>
            {Object.entries(LANGUAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>해결 상태<select value={status} onChange={(event) => filterBy('status', event.target.value)}>
            <option value="">전체 상태</option>
            <option value="solved">해결</option>
            <option value="unsolved">미해결</option>
          </select></label>
        </div>
        <p role="status">{visible.length}개 문제</p>
        <ul className="ex-list">
          <li className="ex-list-head" aria-hidden="true"><span>문제 번호·제목</span><span>난이도</span><span>주제</span><span>언어</span><span>상태</span></li>
          {visible.map(({ problem, number }) => {
            const entry = progress[problem.id]
            const status = problemStatus(entry)
            return <li key={problem.id}>
              <Link className="ex-row" data-lang to={numberedProblemPath(number, language)}>
                <strong><span className="algorithm-number">{number}번</span>{problem.title} <MemberLock /></strong>
                <Dots level={problem.level} />
                <span className="ex-topics">{problem.topics.join(' · ')}</span>
                <span className="ex-lang">{problem.langs.map((lang) => LANGUAGES[lang]).join(' / ')}</span>
                <span className="ex-state" data-state={entry?.solved ? 'solved' : status === 'new' ? 'new' : 'trying'}>{status === 'new' ? '미시도' : status}</span>
              </Link>
            </li>
          })}
        </ul>
        {visible.length === 0 && <p className="ex-empty">조건에 맞는 문제가 없습니다.</p>}
      </section>
    </div>
  </main>
}
