import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CalendarRange, RotateCcw, Settings2, Share2 } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import MemberLock from '../../../components/MemberLock'
import PageHeading from '../../../components/PageHeading'
import { useAuth } from '../../../contexts/useAuth'
import { algorithmChallenges } from './algorithmChallenges'
import { useJudgeProgress, shareJudgeResult } from './judgeProgress'
import { JudgeTierBadge } from './JudgeTierBadge'
import { JUDGE_TIER_FAMILIES, judgeTier } from './judgeTiers'
import { problemStatus } from './navigation'
import { numberedProblemNumber, numberedProblemPath } from './problemNumbers'
import { numberedExercises } from './problems'
import { useProgress } from './progress'
import { LANG_NAMES } from './types'
import '../study.css'
import './exercises.css'
import './judge-catalog.css'

const PAGE_SIZE = 30
const TIER_VALUES = new Set([...JUDGE_TIER_FAMILIES.map(({ value }) => value), ...Array.from({ length: 32 }, (_, value) => String(value))])
const LANG_VALUES = Object.keys(LANG_NAMES)
const STATUS_VALUES = new Set(['solved', 'unsolved'])

export default function AlgorithmPage() {
  const { user } = useAuth()
  const location = useLocation()
  const verified = useJudgeProgress(Boolean(user))
  const saved = useProgress()
  const [now, setNow] = useState(Date.now)
  const [shareMessage, setShareMessage] = useState('')
  const [search, setSearch] = useSearchParams()
  const { daily, weekly, nextMidnight } = algorithmChallenges(now)
  const query = search.get('q') ?? ''
  const term = query.trim().replace(/^#/, '').toLocaleLowerCase('ko-KR')
  const tier = TIER_VALUES.has(search.get('tier') ?? '') ? search.get('tier') ?? '' : ''
  const language = LANG_VALUES.includes(search.get('lang') ?? '') ? search.get('lang') ?? '' : ''
  const status = STATUS_VALUES.has(search.get('status') ?? '') ? search.get('status') ?? '' : ''
  const rawPage = Number(search.get('page'))
  const requestedPage = Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1
  const solvedNumbers = new Set(verified?.solved ?? numberedExercises.filter(({ problem }) => saved[problem.id]?.solved).map(({ number }) => number))
  const exactNumber = /^\d+$/.test(term) && numberedExercises.some(({ number }) => String(number) === term)
  const visible = numberedExercises.filter(({ problem, number }) =>
    (!tier || judgeTier(problem).family === tier || String(judgeTier(problem).value) === tier) &&
    (!language || problem.langs.some((lang) => lang === language)) &&
    (!status || solvedNumbers.has(number) === (status === 'solved')) &&
    (!term || (exactNumber ? String(number) === term : String(number).startsWith(term)) || problem.title.toLocaleLowerCase('ko-KR').includes(term) ||
      problem.topics.some((topic) => topic.toLocaleLowerCase('ko-KR').includes(term))),
  )
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const page = Math.min(requestedPage, pageCount)
  const rows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasFilters = Boolean(query || tier || language || status)
  const changeFilter = (key: 'q' | 'tier' | 'lang' | 'status' | 'page', value: string) => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    }, { replace: true })
  }
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) =>
    Math.max(1, Math.min(page - 2, pageCount - 4)) + index,
  )

  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = window.setTimeout(refresh, Math.max(0, nextMidnight - Date.now()))
    window.addEventListener('focus', refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [nextMidnight])

  const share = async () => {
    if (!verified) return
    try {
      await shareJudgeResult({ progress: verified })
      setShareMessage('기록 링크를 공유했습니다.')
    } catch {
      setShareMessage('기록 링크를 공유하지 못했습니다.')
    }
  }

  return <main className="study-page ex-page judge-catalog">
    <div className="ex-container">
      <nav className="judge-catalog-back" aria-label="알고리즘 메뉴">
        <Link to="/study"><ArrowLeft size={16} aria-hidden="true" />스터디 자료</Link>
        {user && <Link to="/study/algorithms/settings" state={{ from: location.pathname + location.search }}><Settings2 size={16} aria-hidden="true" />코딩 설정</Link>}
      </nav>
      <header className="judge-catalog-hero">
        <div>
          <PageHeading>알고리즘 문제</PageHeading>
          <p>문제를 고르고 코드를 제출하세요. 오늘의 문제부터 차근차근 시작할 수 있습니다.</p>
        </div>
        <div className="judge-catalog-tally" aria-live="polite">
          <span>등록 문제</span>
          <strong>{numberedExercises.length.toLocaleString('ko-KR')}</strong>
        </div>
      </header>

      {user && <section className="judge-achievements" aria-label="내 문제 풀이 기록">
        <div><strong>{verified ? verified.solved.length : solvedNumbers.size}</strong><span>{verified ? '채점 완료' : '브라우저 해결 기록'}</span></div>
        <div><strong>{verified?.solvedToday ?? 0}</strong><span>오늘 해결</span></div>
        <div><strong>{verified?.streak ?? 0}</strong><span>연속 풀이일</span></div>
        {verified && <button type="button" onClick={() => void share()}><Share2 size={16} aria-hidden="true" />기록 공유</button>}
        {shareMessage && <p role="status">{shareMessage}</p>}
      </section>}

      <div className="judge-challenges">
        {[
          { id: 'daily', label: '오늘의 문제', icon: CalendarDays, ...daily },
          { id: 'weekly', label: '주간 문제', icon: CalendarRange, ...weekly },
        ].map(({ id, label, icon: Icon, problem, dates }) => {
          const number = numberedProblemNumber(problem.id)
          if (number === undefined) return null
          const solved = solvedNumbers.has(number)
          return <section key={id} className="judge-challenge" data-kind={id} aria-labelledby={`algorithm-${id}`}>
            <div className="judge-challenge-top"><h2 id={`algorithm-${id}`}><Icon size={18} aria-hidden="true" />{label}</h2><span>{dates}</span></div>
            <p className="judge-challenge-number">{number}번</p>
            <h3>{problem.title}</h3>
            <div className="judge-challenge-meta"><JudgeTierBadge problem={problem} /><span>{problem.topics.join(' · ')}</span></div>
            <div className="judge-challenge-bottom">
              <Link to={numberedProblemPath(number)}>{solved ? '다시 풀기' : '문제 풀기'} <MemberLock /><ArrowRight size={17} aria-hidden="true" /></Link>
              {solved && <span className="judge-solved">해결 완료</span>}
            </div>
          </section>
        })}
      </div>
      <p className="judge-schedule">한국 시간 기준 매일 자정과 매주 월요일에 과제가 바뀝니다.</p>

      <section className="judge-catalog-list" aria-labelledby="algorithm-list">
        <div className="judge-list-heading"><h2 id="algorithm-list">전체 문제</h2></div>
        <div className="judge-catalog-filters" role="group" aria-label="알고리즘 문제 필터">
          <label className="judge-search">문제 검색<input type="search" value={query} onChange={(event) => changeFilter('q', event.target.value)} placeholder="번호, 제목, 주제" /></label>
          <label>난이도<select value={tier} onChange={(event) => changeFilter('tier', event.target.value)}>
            <option value="">전체 난이도</option>
            <option value="unrated">미평가</option>
            {JUDGE_TIER_FAMILIES.slice(1, -1).map((family, index) => <optgroup key={family.value} label={family.label}>
              <option value={family.value}>{family.label} 전체</option>
              {[0, 1, 2, 3, 4].map((offset) => {
                const value = index * 5 + offset + 1
                return <option key={value} value={value}>{judgeTier({ level: 1, difficultyTier: value }).label}</option>
              })}
            </optgroup>)}
            <option value="master">마스터</option>
          </select></label>
          <label>언어<select value={language} onChange={(event) => changeFilter('lang', event.target.value)}><option value="">전체 언어</option>{Object.entries(LANG_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label>해결 상태<select value={status} onChange={(event) => changeFilter('status', event.target.value)}><option value="">전체 상태</option><option value="solved">해결</option><option value="unsolved">미해결</option></select></label>
          {hasFilters && <button type="button" className="judge-filter-reset" onClick={() => setSearch({}, { replace: true })}><RotateCcw size={14} aria-hidden="true" />초기화</button>}
        </div>
        <p className="judge-result-count" role="status">{visible.length.toLocaleString('ko-KR')}개 문제</p>
        {rows.length > 0 ? <ul className="judge-table">
          <li className="judge-table-head" aria-hidden="true"><span>번호</span><span>문제</span><span>난이도</span><span>언어</span><span>상태</span></li>
          {rows.map(({ number, problem }) => {
            const solved = solvedNumbers.has(number)
            const state = problemStatus(saved[problem.id])
            return <li key={number}>
              <Link to={numberedProblemPath(number, language)} className="judge-table-row">
                <span className="judge-table-number">{number}</span>
                <strong>{problem.title}<MemberLock /><small>{problem.sourceId ? 'DailyCoding · ' : ''}{problem.topics.slice(0, 2).join(' · ')}</small></strong>
                <JudgeTierBadge problem={problem} />
                <span className="judge-table-languages">{problem.langs.map((lang) => LANG_NAMES[lang]).join(' · ')}</span>
                <span className="judge-table-state" data-solved={solved || undefined}>{solved ? '해결' : state === 'new' ? '미시도' : state}</span>
              </Link>
            </li>
          })}
        </ul> : <div className="judge-empty"><p>일치하는 문제가 없습니다.</p><button type="button" onClick={() => setSearch({}, { replace: true })}>조건 초기화</button></div>}
        {pageCount > 1 && <nav className="judge-pagination" aria-label="문제 목록 페이지">
          <button type="button" disabled={page === 1} onClick={() => changeFilter('page', String(page - 1))} aria-label="이전 페이지"><ArrowLeft size={16} /></button>
          {pageNumbers.map((number) => <button key={number} type="button" aria-current={number === page ? 'page' : undefined} onClick={() => changeFilter('page', String(number))}>{number}</button>)}
          <button type="button" disabled={page === pageCount} onClick={() => changeFilter('page', String(page + 1))} aria-label="다음 페이지"><ArrowRight size={16} /></button>
        </nav>}
      </section>
    </div>
  </main>
}
