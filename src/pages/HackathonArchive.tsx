import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import PageHeading from '../components/PageHeading'
import HackathonStatusBadge from '../features/hackathon/HackathonStatusBadge'
import { formatPeriod, semesterLabel } from '../features/hackathon/hackathon'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { listHackathonEvents, type HackathonEventSummary } from '../services/hackathonApi'
import '../styles/site-pages.css'
import '../styles/hackathon.css'

function EventCard({ event, now = false }: { event: HackathonEventSummary; now?: boolean }) {
  const period = formatPeriod(event.startsAt, event.endsAt)
  return <Link to={`/hackathon/${event.id}`} className={`hackathon-card${now ? ' hackathon-card--now' : ''}`}>
    <div className="flex flex-wrap items-center gap-3">
      <HackathonStatusBadge status={event.status} />
      <span className="text-sm font-semibold text-[var(--app-accent-text)]">{semesterLabel(event)}</span>
    </div>
    <h3 className="mt-3 text-xl font-bold">{event.title}</h3>
    {event.theme && <p className="mt-1 text-sm text-[var(--app-muted)]">주제 · {event.theme}</p>}
    <p className="mt-3 text-sm">개발 기간 · {period ? `${period} (한국 시간)` : '미정'}</p>
    <p className="mt-1 text-sm text-[var(--app-muted)]">공개 작품 {event.projectCount}개{event.resultsPublished ? ' · 결과 공개' : ''}</p>
    {now && <p className="mt-4 text-sm font-semibold text-[var(--app-accent-text)]">평가하러 가기 →</p>}
  </Link>
}

export default function HackathonArchive() {
  useDocumentTitle('해커톤 아카이브')
  const events = useQuery({ queryKey: ['hackathon', 'events'], queryFn: listHackathonEvents, retry: 1, refetchOnWindowFocus: true })
  const list = events.data ?? []
  const evaluating = list.filter(event => event.open && event.status === 'REVIEWING')
  const planned = list.filter(event => event.status === 'UPCOMING' || event.status === 'IN_PROGRESS')
  const archived = list.filter(event => !evaluating.includes(event) && !planned.includes(event))
  const years = [...new Set(archived.map(event => event.year))].sort((a, b) => b - a)
  return <div className="site-page"><main className="site-page-inner hackathon-page">
    <PageHeading>해커톤 아카이브</PageHeading>
    <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--app-muted)]">COM’s 해커톤의 기록입니다. 지난 행사의 작품과 자료, 공개된 결과를 언제든 다시 볼 수 있습니다.</p>
    <Link to="/forms?category=HACKATHON" className="apple-action-secondary mt-5 inline-flex min-h-11 items-center px-4 text-sm">해커톤 신청·수요조사</Link>
    {events.isPending && <p role="status" className="mt-6">해커톤 기록을 불러오는 중…</p>}
    {events.isError && <p role="alert" className="mt-6">해커톤 기록을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => events.refetch()}>다시 불러오기</button></p>}
    {events.isSuccess && list.length === 0 && <p className="mt-6 rounded-xl bg-[var(--app-surface-soft)] p-5">아직 공개된 해커톤이 없습니다.</p>}
    {evaluating.length > 0 && <section aria-labelledby="hackathon-now" className="mt-8">
      <h2 id="hackathon-now" className="text-lg font-bold">지금 평가할 수 있어요</h2>
      <div className="mt-3 grid gap-4">{evaluating.map(event => <EventCard key={event.id} event={event} now />)}</div>
    </section>}
    {planned.length > 0 && <section aria-labelledby="hackathon-planned" className="mt-10">
      <h2 id="hackathon-planned" className="text-2xl font-bold">진행 예정 · 진행 중</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">{planned.map(event => <li key={event.id} className="min-w-0"><EventCard event={event} /></li>)}</ul>
    </section>}
    {years.map(year => <section key={year} aria-labelledby={`hackathon-year-${year}`} className="mt-10">
      <h2 id={`hackathon-year-${year}`} className="text-2xl font-bold">{year}년</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">{archived.filter(event => event.year === year).map(event => <li key={event.id} className="min-w-0"><EventCard event={event} /></li>)}</ul>
    </section>)}
  </main></div>
}
