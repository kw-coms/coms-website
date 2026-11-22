import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import PageHeading from '../components/PageHeading'
import { OpportunityDates, OpportunitySourceLink } from '../features/opportunities/OpportunityDetails'
import {
  isOpportunityCategory,
  listOpportunities,
  OPPORTUNITY_CATEGORIES,
  opportunityQuery,
  type OpportunityCategory,
} from '../services/opportunityApi'
import '../styles/site-pages.css'

const categoryChoices = Object.entries(OPPORTUNITY_CATEGORIES) as [OpportunityCategory, string][]

export default function ExternalOpportunities() {
  const [params, setParams] = useSearchParams()
  const rawCategory = params.get('category')
  const category = isOpportunityCategory(rawCategory) ? rawCategory : ''
  const list = useQuery({ queryKey: opportunityQuery, queryFn: listOpportunities, retry: 1 })
  const groups = categoryChoices
    .filter(([value]) => !category || value === category)
    .map(([value, label]) => ({ value, label, items: list.data?.filter(item => item.category === value) ?? [] }))
    .filter(group => group.items.length > 0)

  return <div className="site-page"><main className="site-page-inner">
    <div className="site-head">
      <div>
        <PageHeading>외부 일정</PageHeading>
        <p className="site-head-lead">공식 출처에서 확인한 해커톤, 코딩 대회, 교육·부트캠프 일정을 모았습니다. 날짜와 시간은 한국 기준입니다.</p>
      </div>
    </div>
    <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="일정 종류">
      <button type="button" aria-pressed={!category} onClick={() => setParams({})} className="apps-chip">전체</button>
      {categoryChoices.map(([value, label]) => <button key={value} type="button" aria-pressed={category === value}
        onClick={() => setParams({ category: value })} className="apps-chip">{label}</button>)}
    </div>
    {list.isPending && <p role="status" className="mt-6">공개 일정을 불러오는 중…</p>}
    {list.isError && <p role="alert" className="mt-6">공개 일정을 불러오지 못했습니다. <button type="button" onClick={() => void list.refetch()} className="underline">다시 불러오기</button></p>}
    {list.isSuccess && groups.length === 0 && <p role="status" className="mt-6 rounded-xl bg-[var(--app-surface-soft)] p-5">이 종류에 공개된 일정이 없습니다.</p>}
    {groups.map(group => <section key={group.value} className="mt-8" aria-labelledby={`external-opportunities-${group.value}`}>
      <h2 className="mb-3 text-xl font-bold" id={`external-opportunities-${group.value}`}>{group.label}</h2>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {group.items.map(item => <li key={item.id} className="flex min-w-0 flex-col rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-5">
          <p className="break-words text-sm font-semibold text-[var(--app-muted)]">{item.sourceName}</p>
          <h3 className="mt-2 break-words text-lg font-bold">{item.title}</h3>
          <OpportunityDates dates={item} />
          <div className="mt-auto pt-5"><OpportunitySourceLink url={item.sourceUrl} title={item.title} /></div>
        </li>)}
      </ul>
    </section>)}
  </main></div>
}
