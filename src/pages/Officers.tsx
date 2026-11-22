import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import PageHeading from '../components/PageHeading'
import { ListSearch } from '../components/common/ListTools'
import { generationLabel, groupByDecade, termMatches, type OfficerView, type TermView } from '../features/clubOfficers/clubOfficers'
import { listClubOfficers } from '../services/clubOfficerApi'
import '../styles/site-pages.css'
import '../styles/officers.css'

function Names({ title, officers }: { title: string; officers: OfficerView[] }) {
  return <div className="of-role">
    <dt>{title}</dt>
    <dd>{officers.length === 0
      ? <span className="of-empty">기록 없음</span>
      : <ul>{officers.map((officer) => <li key={officer.id}>
        <span className="of-name">{officer.name}</span>
        {officer.generation && <span className="of-gen">{generationLabel(officer.generation)}</span>}
      </li>)}</ul>}</dd>
  </div>
}

function Term({ term }: { term: TermView }) {
  const presidents = term.officers.filter((officer) => officer.role === 'PRESIDENT')
  const vices = term.officers.filter((officer) => officer.role === 'VICE_PRESIDENT')
  return <li className="of-term">
    <div className="of-term-head">
      <time className="of-year" dateTime={String(term.year)}>{term.year}년</time>
      <span className="of-label">{term.label}{/^\d+대$/.test(term.label) ? ' 회장단' : ''}</span>
    </div>
    <dl className="of-roles">
      <Names title="회장" officers={presidents} />
      <Names title="부회장" officers={vices} />
    </dl>
    {term.note && <p className="of-note">{term.note}</p>}
  </li>
}

export default function Officers() {
  const [query, setQuery] = useState('')
  const terms = useQuery({ queryKey: ['club-officers', 'list'], queryFn: listClubOfficers, retry: 1 })
  const filtered = useMemo(() => (terms.data ?? []).filter((term) => termMatches(query, term)), [terms.data, query])
  const groups = useMemo(() => groupByDecade(filtered), [filtered])
  const searching = query.trim().length > 0
  const jump = (decade: number) => document.getElementById(`of-decade-${decade}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <div className="site-page"><main className="site-page-inner of-page">
    <PageHeading>역대 회장단</PageHeading>
    <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--app-muted)]">COM'S를 이끌어 온 회장과 부회장을 연도별로 모았습니다. 카드의 ‘대’는 회장단 임기이고, 이름 옆의 ‘기’는 개인의 가입 기수입니다.</p>
    <div className="of-tools">
      <ListSearch value={query} onChange={setQuery} label="회장단 검색" placeholder="이름·연도·임기(예: 52대)로 검색" />
      {terms.data && <p role="status" className="of-count">{searching ? `${filtered.length}개 임기가 검색되었습니다.` : `총 ${terms.data.length}개 임기`}</p>}
    </div>
    {terms.isPending && <p role="status" className="mt-8">불러오는 중…</p>}
    {terms.isError && <p role="alert" className="mt-8 text-sm">회장단 기록을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => terms.refetch()}>다시 불러오기</button></p>}
    {terms.data?.length === 0 && <p className="of-card mt-8">아직 등록된 회장단 기록이 없습니다.</p>}
    {terms.data && terms.data.length > 0 && filtered.length === 0 && <p className="of-card mt-8">‘{query.trim()}’에 해당하는 임기가 없습니다.</p>}
    {groups.length > 1 && <nav className="of-jump" aria-label="연대 바로가기">
      {groups.map((group) => <button key={group.decade} type="button" onClick={() => jump(group.decade)}>{group.title}</button>)}
    </nav>}
    <div className="of-groups">
      {groups.map((group) => <section key={group.decade} id={`of-decade-${group.decade}`} aria-labelledby={`of-decade-title-${group.decade}`} className="of-decade">
        <h2 id={`of-decade-title-${group.decade}`} className="of-decade-title">{group.title}<span>{group.terms.length}개 임기</span></h2>
        <ol className="of-terms">{group.terms.map((term) => <Term key={term.id} term={term} />)}</ol>
      </section>)}
    </div>
  </main></div>
}
