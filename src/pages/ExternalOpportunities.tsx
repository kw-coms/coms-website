import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import PageHeading from '../components/PageHeading'
import ExternalOpportunityGatherings from '../features/opportunities/ExternalOpportunityGatherings'
import { OpportunityDates, OpportunitySourceLink, OpportunityStatusBadges } from '../features/opportunities/OpportunityDetails'
import { compareOpportunitiesSoon, opportunityPhases, type OpportunityPhase } from '../features/opportunities/opportunityStatus'
import {
  isOpportunityCategory,
  listOpportunities,
  OPPORTUNITY_CATEGORIES,
  opportunityQuery,
  type OpportunityCategory,
} from '../services/opportunityApi'
import '../styles/site-pages.css'

const categoryChoices = Object.entries(OPPORTUNITY_CATEGORIES) as [OpportunityCategory, string][]
const phaseChoices: [OpportunityPhase, string][] = [
  ['upcoming', '시작 전'], ['ongoing', '진행 중'], ['ended', '종료'], ['unknown', '일정 미정'],
]

export default function ExternalOpportunities() {
  const [params, setParams] = useSearchParams()
  const pendingParams = useRef(params)
  const rawCategory = params.get('category')
  const category = isOpportunityCategory(rawCategory) ? rawCategory : ''
  const rawPhase = params.get('phase')
  const phase = phaseChoices.some(([value]) => value === rawPhase) ? rawPhase as OpportunityPhase : ''
  const query = params.get('q') ?? ''
  const sort = params.get('sort') === 'newest' ? 'newest' : 'soon'
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const changeFilter = (name: 'category' | 'phase' | 'q' | 'sort', value: string) => {
    const next = new URLSearchParams(pendingParams.current)
    if (value) next.set(name, value)
    else next.delete(name)
    pendingParams.current = next
    setParams(next, { replace: true })
  }
  const list = useQuery({ queryKey: opportunityQuery, queryFn: listOpportunities, retry: 1 })
  const term = query.trim().toLocaleLowerCase('ko-KR')
  const visible = (list.data ?? [])
    .filter(item => !category || item.category === category)
    .filter(item => !phase || opportunityPhases(item, now).overall === phase)
    .filter(item => !term || `${item.title} ${item.sourceName}`.toLocaleLowerCase('ko-KR').includes(term))
    .sort(sort === 'newest'
      ? (a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0) || b.id - a.id
      : (a, b) => compareOpportunitiesSoon(a, b, now))

  return <div className="site-page"><main className="site-page-inner">
    <div className="site-head">
      <div>
        <PageHeading>외부 일정</PageHeading>
        <p className="site-head-lead">공식 출처에서 확인한 해커톤, 코딩 대회, 교육·부트캠프 일정을 모았습니다. 날짜와 시간은 한국 기준입니다.</p>
      </div>
    </div>
    <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="일정 종류">
      <button type="button" aria-pressed={!category} onClick={() => changeFilter('category', '')} className="apps-chip">전체</button>
      {categoryChoices.map(([value, label]) => <button key={value} type="button" aria-pressed={category === value}
        onClick={() => changeFilter('category', value)} className="apps-chip">{label}</button>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="일정 진행 상태">
      <button type="button" aria-pressed={!phase} onClick={() => changeFilter('phase', '')} className="apps-chip">상태 전체</button>
      {phaseChoices.map(([value, label]) => <button key={value} type="button" aria-pressed={phase === value}
        onClick={() => changeFilter('phase', value)} className="apps-chip">{label}</button>)}
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="min-w-[180px] flex-1 text-sm font-semibold">일정 검색
        <input type="search" value={query} onChange={event => changeFilter('q', event.target.value)}
          placeholder="제목 또는 주최 기관" className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-3 text-base" />
      </label>
      <label className="text-sm font-semibold">정렬
        <select value={sort} onChange={event => changeFilter('sort', event.target.value === 'newest' ? 'newest' : '')}
          className="mt-1 block min-h-11 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-3 text-base">
          <option value="soon">진행·다가오는 일정순</option><option value="newest">최근 공개순</option>
        </select>
      </label>
    </div>
    {list.isPending && <p role="status" className="mt-6">공개 일정을 불러오는 중…</p>}
    {list.isError && <p role="alert" className="mt-6">공개 일정을 불러오지 못했습니다. <button type="button" onClick={() => void list.refetch()} className="underline">다시 불러오기</button></p>}
    {list.isSuccess && visible.length === 0 && <p role="status" className="mt-6 rounded-xl bg-[var(--app-surface-soft)] p-5">{phase || term ? '조건에 맞는 공개 일정이 없습니다.' : '이 종류에 공개된 일정이 없습니다.'}</p>}
    {visible.length > 0 && <ul className="mt-8 grid list-none gap-3 p-0 sm:grid-cols-2">
        {visible.map(item => <li key={item.id} id={`opportunity-${item.id}`} className="flex min-w-0 flex-col rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-5">
          <p className="break-words text-sm font-semibold text-[var(--app-muted)]">{OPPORTUNITY_CATEGORIES[item.category]} · {item.sourceName}</p>
          <h3 className="mt-2 break-words text-lg font-bold">{item.title}</h3>
          <OpportunityStatusBadges dates={item} now={now} />
          <OpportunityDates dates={item} />
          <div className="mt-auto pt-5"><OpportunitySourceLink url={item.sourceUrl} title={item.title} /></div>
          <ExternalOpportunityGatherings opportunity={item} now={now} />
        </li>)}
      </ul>}
  </main></div>
}
