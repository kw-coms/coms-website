import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { OpportunityDates, OpportunitySourceLink } from '../../features/opportunities/OpportunityDetails'
import {
  collectOpportunities,
  getOpportunityCollection,
  listReviewOpportunities,
  OPPORTUNITY_CATEGORIES,
  opportunityQuery,
  opportunityReviewQuery,
  reviewOpportunity,
  type CollectionStatus,
  type OpportunityCategory,
  type OpportunityFields,
  type OpportunityStatus,
  type ReviewOpportunity,
} from '../../services/opportunityApi'

const panel = 'min-w-0 rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-4 sm:p-5'
const action = 'apple-action-secondary inline-flex min-h-11 items-center justify-center px-4 text-sm disabled:opacity-50'
const primary = 'apple-action-primary inline-flex min-h-11 items-center justify-center px-4 text-sm disabled:opacity-50'
const input = 'block min-h-11 w-full min-w-0 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-bg)] px-3 py-2 text-base text-[var(--app-text)]'
const label = 'block min-w-0 space-y-2 text-sm font-semibold'
const muted = 'text-sm text-[var(--app-muted)]'
const collectionKey = ['admin', 'opportunity-collection'] as const
const reviewTabs: { value: OpportunityStatus; label: string }[] = [
  { value: 'PENDING', label: '검토 대기' },
  { value: 'PUBLISHED', label: '공개됨' },
  { value: 'IGNORED', label: '제외됨' },
]
const localTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23',
})

function formattedTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '확인 불가' : localTime.format(date)
}

function CollectionPanel() {
  const client = useQueryClient()
  const state = useQuery({
    queryKey: collectionKey, queryFn: getOpportunityCollection,
    refetchInterval: query => query.state.data?.running ? 2000 : 30000,
  })
  const run = useMutation({
    mutationFn: collectOpportunities,
    onSuccess: data => {
      client.setQueryData(collectionKey, data)
      void client.invalidateQueries({ queryKey: collectionKey })
    },
  })
  const lastRunAt = state.data?.lastRunAt
  const lastSeen = useRef<CollectionStatus | undefined>(undefined)
  useEffect(() => {
    const latest = state.data
    const previous = lastSeen.current
    if (latest && previous && !latest.running && (previous.running || previous.lastRunAt !== latest.lastRunAt)) {
      void client.invalidateQueries({ queryKey: opportunityReviewQuery })
    }
    lastSeen.current = latest
  }, [client, state.data])

  return <section aria-labelledby="opportunity-collection-heading" className={panel}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 id="opportunity-collection-heading" className="font-bold">공식 출처 수집</h3>
        {state.isPending && <p className={muted + ' mt-1'} role="status">수집 상태를 불러오는 중…</p>}
        {state.isError && <p className={muted + ' mt-1'} role="alert">수집 상태를 불러오지 못했습니다. <button type="button" className="underline" onClick={() => void state.refetch()}>다시 불러오기</button></p>}
        {state.data && <p role="status" className={muted + ' mt-1'}>
          {state.data.running ? '공고 수집 중…' : state.data.enabled ? '자동 수집 켜짐' : '수집 꺼짐'}
          {lastRunAt && <> · 마지막 수집 <time dateTime={lastRunAt}>{formattedTime(lastRunAt)}</time></>}
        </p>}
      </div>
      <button type="button" className={action} disabled={!state.data?.enabled || state.data.running || run.isPending}
        onClick={() => run.mutate()}>{run.isPending ? '수집 요청 중…' : '지금 수집'}</button>
    </div>
    {run.isError && <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">{run.error.message}</p>}
    {Boolean(state.data?.sources.length) && <ul className="mt-3 grid list-none gap-x-5 gap-y-2 border-t border-[var(--app-hairline)] pt-3 text-sm sm:grid-cols-2">
      {state.data?.sources.map(source => <li key={source.key} className="flex min-w-0 flex-wrap justify-between gap-x-3">
        <span className="break-words font-semibold">{source.name}</span>
        <span className="text-[var(--app-muted)]">{source.result === 'SUCCESS' ? `확인 ${source.found}건 · 변경 ${source.changed}건` : source.result === 'ERROR' ? '확인 실패' : '수집 전'}</span>
      </li>)}
    </ul>}
  </section>
}

function LocalDateField({ name, value, onChange }: { name: string; value: string | null; onChange: (value: string | null) => void }) {
  const [day = '', clock = ''] = (value ?? '').split('T')
  const time = clock.slice(0, 5)
  return <fieldset className="min-w-0">
    <legend className="mb-2 text-sm font-semibold">{name}</legend>
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] gap-2">
      <input type="date" aria-label={name + ' 날짜'} className={input} value={day}
        onChange={event => {
          const next = event.target.value
          onChange(next ? next + (time ? 'T' + time : '') : null)
        }} />
      <input type="time" aria-label={name + ' 시각 (선택)'} className={input} value={time} disabled={!day}
        onChange={event => onChange(event.target.value ? day + 'T' + event.target.value : day)} />
    </div>
  </fieldset>
}

function ReviewEditor({ item, onCancel, onDone }: {
  item: ReviewOpportunity
  onCancel: () => void
  onDone: (updated: ReviewOpportunity, action: 'PUBLISH' | 'IGNORE' | 'UNPUBLISH') => void
}) {
  const [fields, setFields] = useState<OpportunityFields>({
    title: item.title, category: item.category,
    applicationStart: item.applicationStart, applicationEnd: item.applicationEnd,
    eventStart: item.eventStart, eventEnd: item.eventEnd,
  })
  const [publicReady, setPublicReady] = useState(false)
  const request = useMutation({
    mutationFn: (action: 'PUBLISH' | 'IGNORE' | 'UNPUBLISH') => reviewOpportunity(item.id, action === 'PUBLISH'
      ? { ...fields, title: fields.title.trim(), action, version: item.version }
      : { action, version: item.version }),
    onSuccess: (updated, action) => onDone(updated, action),
  })
  const dates = [
    ['applicationStart', '신청 시작'], ['applicationEnd', '신청 마감'],
    ['eventStart', '행사·교육 시작'], ['eventEnd', '행사·교육 종료'],
  ] as const
  const publish = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (publicReady && fields.title.trim()) request.mutate('PUBLISH')
  }

  return <form aria-label="공고 검토" onSubmit={publish} className="mt-4 min-w-0 space-y-4 border-t border-[var(--app-hairline)] pt-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-lg font-bold">공고 검토</h3>
        <p className={muted + ' mt-1 break-words'}>{item.sourceName} · 수집 <time dateTime={item.collectedAt}>{formattedTime(item.collectedAt)}</time>
          {item.aiAssisted && ' · AI 날짜 추출 사용'}</p>
      </div>
      <OpportunitySourceLink url={item.sourceUrl} title={item.title} />
    </div>
    {item.status === 'PENDING' && item.published && <p className={muted}>현재 공개본이 게시 중입니다. 공개하면 아래 내용으로 갱신됩니다.</p>}
    <fieldset disabled={request.isPending} className="min-w-0 space-y-4">
      <legend className="sr-only">공개할 내용</legend>
      <label className={label}>공고 제목
        <input className={input} value={fields.title} required maxLength={250}
          onChange={event => setFields(previous => ({ ...previous, title: event.target.value }))} />
      </label>
      <label className={label}>일정 종류
        <select className={input} value={fields.category}
          onChange={event => setFields(previous => ({ ...previous, category: event.target.value as OpportunityCategory }))}>
          {Object.entries(OPPORTUNITY_CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
      </label>
      <p className={muted}>한국 시간으로 입력하고, 공식 공고에 날짜만 나올 때는 시각을 비워 두세요.</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {dates.map(([key, name]) => <LocalDateField key={key} name={name} value={fields[key]}
          onChange={value => setFields(previous => ({ ...previous, [key]: value }))} />)}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 shrink-0" checked={publicReady}
          onChange={event => setPublicReady(event.target.checked)} />
        공식 공고와 비교해 공개할 내용과 날짜를 확인했습니다.
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={!publicReady || !fields.title.trim()}>{item.published ? '수정 내용 공개' : '공개하기'}</button>
        {item.status === 'PENDING' && <button type="button" className={action} onClick={() => request.mutate('IGNORE')}>이번 수집 제외</button>}
        {item.published && <button type="button" className={action} onClick={() => request.mutate('UNPUBLISH')}>공개 중단</button>}
        <button type="button" className={action} onClick={onCancel}>닫기</button>
      </div>
    </fieldset>
    {request.isPending && <p role="status" className={muted}>변경 사항을 저장하는 중…</p>}
    {request.isError && <p role="alert" className="text-sm text-[var(--app-danger)]">{request.error.message}</p>}
  </form>
}

export default function AdminExternalOpportunities() {
  const client = useQueryClient()
  const [status, setStatus] = useState<OpportunityStatus>('PENDING')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<ReviewOpportunity | null>(null)
  const [message, setMessage] = useState('')
  const list = useQuery({ queryKey: [...opportunityReviewQuery, status, page], queryFn: () => listReviewOpportunities(status, page) })
  const total = list.data?.total ?? 0
  const pageSize = list.data?.size ?? 1
  const done = (updated: ReviewOpportunity, action: 'PUBLISH' | 'IGNORE' | 'UNPUBLISH') => {
    if (action === 'UNPUBLISH') setMessage('공개를 중단했습니다.')
    else if (action === 'IGNORE') setMessage(updated.published ? '이번 수집 내용을 제외했습니다. 기존 공개본은 게시 중입니다.' : '이번 수집 내용을 제외했습니다.')
    else setMessage('외부 일정을 공개했습니다.')
    setSelected(null)
    if (updated.status !== status && list.data?.items.length === 1 && page > 0) setPage(page - 1)
    void client.invalidateQueries({ queryKey: opportunityReviewQuery })
    void client.invalidateQueries({ queryKey: opportunityQuery })
  }

  return <section aria-label="외부 일정 관리" className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold">외부 일정</h2>
        <p className={muted + ' mt-2'}>수집한 공고의 내용을 확인하고 공개합니다.</p>
      </div>
      <Link to="/opportunities" className={action}>공개 일정 보기</Link>
    </div>
    <CollectionPanel />
    <div role="group" aria-label="공고 검토 상태" className="flex flex-wrap gap-2">
      {reviewTabs.map(tab => <button key={tab.value} type="button" aria-pressed={tab.value === status}
        className={tab.value === status ? primary : action}
        onClick={() => { setStatus(tab.value); setPage(0); setSelected(null); setMessage('') }}>
        {tab.label}
      </button>)}
    </div>
    {message && <p role="status" className={muted}>{message}</p>}
    {list.isPending && <p role="status" className={muted}>공고를 불러오는 중…</p>}
    {list.isError && <p role="alert">공고를 불러오지 못했습니다. <button type="button" className="underline" onClick={() => void list.refetch()}>다시 불러오기</button></p>}
    {list.data?.items.length === 0 && <p className={panel}>이 상태의 공고가 없습니다.</p>}
    {Boolean(list.data?.items.length) && <ul className="grid list-none gap-3">
      {list.data?.items.map(item => <li key={item.id} className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={muted + ' break-words'}>{OPPORTUNITY_CATEGORIES[item.category]} · {item.sourceName}
              {item.aiAssisted && ' · AI 추출'}{item.published && item.status !== 'PUBLISHED' && ' · 공개본 있음'}</p>
            <h3 className="mt-1 break-words font-bold">{item.title}</h3>
          </div>
          <button type="button" className={action} aria-label={item.title + ' 검토'} aria-pressed={selected?.id === item.id}
            onClick={() => { setSelected(selected?.id === item.id ? null : item); setMessage('') }}>{selected?.id === item.id ? '검토 닫기' : '검토'}</button>
        </div>
        {selected?.id === item.id
          ? <ReviewEditor item={selected} onCancel={() => setSelected(null)} onDone={done} />
          : <OpportunityDates dates={item} />}
      </li>)}
    </ul>}
    {(page > 0 || total > pageSize) && <nav aria-label="공고 목록 페이지" className="flex flex-wrap items-center gap-3">
      <button type="button" className={action} disabled={page === 0}
        onClick={() => { setPage(page - 1); setSelected(null) }}>이전</button>
      <span className={muted}>{page + 1} / {Math.max(1, Math.ceil(total / pageSize))} 페이지</span>
      <button type="button" className={action} disabled={(page + 1) * pageSize >= total}
        onClick={() => { setPage(page + 1); setSelected(null) }}>다음</button>
    </nav>}
  </section>
}
