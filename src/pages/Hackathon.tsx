import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight, Copy } from 'lucide-react'
import PageHeading from '../components/PageHeading'
import { useAuth } from '../contexts/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getHackathonEvent, submitEventReview, type AlumniIdentity, type HackathonMaterial, type HackathonProject, type HackathonResult } from '../services/hackathonApi'
import HackathonScoreForm from '../features/hackathon/HackathonScoreForm'
import HackathonStatusBadge from '../features/hackathon/HackathonStatusBadge'
import { CRITERIA, STATUS_META, formatPeriod, semesterLabel } from '../features/hackathon/hackathon'
import { currentGeneration } from '../utils/roleAccess'
import '../styles/site-pages.css'
import '../styles/hackathon.css'

const sharePath = (id: number) => `/hackathon/${id}/share`
const scoreFormat = (score: number) => score.toFixed(2)
const materialLabel = (material: HackathonMaterial) => material.label || material.originalName

function Materials({ materials, title }: { materials: HackathonMaterial[]; title: string }) {
  const poster = materials.find(item => item.kind === 'poster')?.url
  return <>
    <div className="mt-4 flex flex-wrap gap-2">{materials.filter(item => item.kind !== 'poster' && item.kind !== 'video').map(item =>
      <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm">{materialLabel(item)}</a>)}</div>
    {materials.filter(item => item.kind === 'video').map(item => <details key={item.id} className="mb-6 mt-4 rounded-xl border border-[var(--app-hairline)] p-4">
      <summary className="cursor-pointer text-sm font-semibold">{title} 시연 영상 보기</summary>
      <video controls playsInline preload="none" poster={poster} aria-label={`${title} 시연 영상`} className="mt-4 aspect-video w-full rounded-lg bg-black">
        <source src={item.url} type={item.mimeType || 'video/mp4'} />
        <a href={item.url}>시연 영상 다운로드</a>
      </video>
      <a href={item.url} download className="mt-3 inline-block text-sm text-[var(--app-accent-text)] underline">영상 다운로드</a>
    </details>)}
  </>
}

function Results({ results }: { results: HackathonResult[] }) {
  return <section className="hackathon-intro mt-6" aria-labelledby="hackathon-results-title">
    <h2 id="hackathon-results-title" className="text-2xl font-bold">최종 결과</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">최종 점수는 졸업생 평균 50% + 회장 평가 50%이며, 동점이면 완성도 → 주제 적합성 순입니다. 각 항목은 20점, 총 100점 만점입니다.</p>
    <div role="region" aria-label="최종 순위표" tabIndex={0} className="mt-4 overflow-x-auto">
      <table className="hackathon-results w-full min-w-[720px] text-sm">
        <caption className="sr-only">해커톤 최종 순위</caption>
        <thead><tr>{['순위', '팀', '최종 점수', '졸업생 평균', '회장 평가', ...CRITERIA.map(item => item.label)].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{results.map(row => <tr key={row.projectId}>
          <th scope="row">{row.rank}위</th>
          <td><a href={`#${row.projectId}`} className="font-semibold underline">{row.title}</a><span className="block text-xs text-[var(--app-muted)]">{row.author}</span></td>
          <td className="font-bold">{scoreFormat(row.finalScore)}점</td>
          <td>{scoreFormat(row.alumniAverage)}점 <span className="text-xs text-[var(--app-muted)]">({row.alumniCount}명)</span></td>
          <td>{scoreFormat(row.chairScore)}점</td>
          {CRITERIA.map(({ key }) => <td key={key}>{scoreFormat(row.criteria[key])}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="mt-3 text-xs text-[var(--app-muted)]">항목별 점수는 졸업생 평균과 회장 점수의 평균입니다. 평가자 이름과 개별 의견은 공개하지 않습니다.</p>
  </section>
}

function ProjectEvaluation({ project, eventId, identity, open }: { project: HackathonProject; eventId: number; identity: AlumniIdentity | null; open: boolean }) {
  const [submittedFor, setSubmittedFor] = useState('')
  const identityKey = identity ? `${eventId}:${identity.generation}:${identity.name.normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase('en')}` : ''
  const submitted = Boolean(identityKey && submittedFor === identityKey)
  return <article id={project.projectId} className="hackathon-project" aria-labelledby={`${project.projectId}-title`}>
    <header className="mb-5">
      <p className="text-sm font-semibold text-[var(--app-muted)]">{project.author}</p>
      <h2 id={`${project.projectId}-title`} className="mt-1 text-2xl font-bold">{project.title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--app-muted)]">{project.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {project.live && <a href={project.live} target="_blank" rel="noreferrer" className="apple-action-primary inline-flex min-h-11 items-center gap-1 px-4 text-sm">작품 체험 <ArrowUpRight size={14} aria-hidden="true" /></a>}
        {project.github && <a href={project.github} target="_blank" rel="noreferrer" className="apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm">GitHub</a>}
      </div>
      <Materials materials={project.materials} title={project.title} />
    </header>
    {open && (submitted ? <p role="status" className="rounded-xl bg-[var(--app-accent-soft)] p-5 text-sm font-semibold">{project.title} 평가가 접수되었습니다. 소중한 평가와 피드백 감사합니다.</p> : <HackathonScoreForm projectId={project.projectId} disabled={!identity} note={!identity ? '먼저 위에서 기수와 이름을 입력해 주세요.' : '제출 후에는 수정할 수 없습니다. 점수와 피드백을 확인해 주세요.'} onSubmit={async (scores) => {
      await submitEventReview(eventId, { ...scores, ...identity, projectId: project.projectId })
      setSubmittedFor(identityKey)
    }} />)}
  </article>
}

export default function Hackathon() {
  const { eventId: eventParam } = useParams()
  const eventId = eventParam !== undefined && /^[1-9]\d*$/.test(eventParam) ? Number(eventParam) : 0
  const { user } = useAuth()
  const [generation, setGeneration] = useState('')
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const validEventId = Number.isSafeInteger(eventId) && eventId > 0
  const detail = useQuery({ queryKey: ['hackathon', 'event', eventId], queryFn: () => getHackathonEvent(eventId), enabled: validEventId, retry: 1, refetchOnWindowFocus: true })
  const event = detail.data
  useDocumentTitle(event?.title)
  const normalizedName = name.normalize('NFKC').trim()
  const identity = /^\d{1,3}$/.test(generation) && Number(generation) >= 1 && Number(generation) <= currentGeneration() && normalizedName.replace(/\s/g, '').length >= 2 && normalizedName.length <= 40
    ? { generation: Number(generation), name: normalizedName } : null
  const link = sharePath(eventId)
  return <div className="site-page"><main className="site-page-inner hackathon-page">
    {(!validEventId || detail.isError) && <div role="alert" className="hackathon-project"><PageHeading>해커톤을 찾을 수 없습니다.</PageHeading><Link to="/hackathon" className="mt-4 inline-block underline">해커톤 아카이브로 돌아가기</Link></div>}
    {detail.isPending && validEventId && <p role="status">해커톤을 불러오는 중…</p>}
    {event && <>
      <Link to="/hackathon" className="mb-3 inline-block text-sm text-[var(--app-accent-text)] underline">← 해커톤 아카이브</Link>
      <PageHeading>{event.title}</PageHeading>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm font-semibold text-[var(--app-accent-text)]">{semesterLabel(event)}</p>
        <HackathonStatusBadge status={event.status} />
        <p className="text-sm text-[var(--app-muted)]">개발 기간 {formatPeriod(event.startsAt, event.endsAt) ?? '미정'} (한국 시간)</p>
      </div>
      {event.open ? <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--app-muted)]">선배님들의 경험으로 후배들의 작품을 살펴봐 주세요.<br />로그인 없이 기수와 이름만 입력하면 평가에 참여하실 수 있습니다.</p>
        : <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--app-muted)]">{STATUS_META[event.status].hint} 작품과 자료는 기록으로 계속 볼 수 있습니다.</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        {event.open && <button type="button" className="apple-action-secondary inline-flex min-h-11 items-center gap-2 px-4 text-sm" onClick={async () => {
          try { await navigator.clipboard.writeText(`${window.location.origin}${link}`); setCopied(true); setCopyError(false) } catch { setCopied(false); setCopyError(true) }
        }}><Copy size={14} aria-hidden="true" />{copied ? '링크 복사됨' : '평가 링크 복사'}</button>}
        {user?.role === 'ADMIN' && <Link to={`/admin?tab=hackathon&event=${eventId}`} className="apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm">평가 집계·회장 채점</Link>}
      </div>
      {copyError && <p role="alert" className="mt-3 break-all text-sm">자동 복사가 지원되지 않습니다. 주소를 길게 눌러 복사해 주세요: <a href={link} className="select-all text-[var(--app-accent-text)] underline">{window.location.origin}{link}</a></p>}
      <section className="hackathon-intro mt-8" aria-labelledby="hackathon-theme">
        <p className="text-sm font-semibold text-[var(--app-accent-text)]">이번 주제</p>
        <h2 id="hackathon-theme" className="mt-2 text-3xl font-bold">{event.theme || event.title}</h2>
        {event.introduction && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--app-muted)]">{event.introduction}</p>}
        {event.rules && <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{event.rules}</p>}
        <Materials materials={event.materials} title={event.title} />
      </section>
      {event.resultsPublished && event.results.length > 0 && <Results results={event.results} />}
      {event.open && event.projects.length > 0 && <section className="hackathon-identity mt-6" aria-labelledby="hackathon-identity-title">
        <h2 id="hackathon-identity-title" className="text-lg font-bold">평가자 정보</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">기수와 이름으로 팀별 중복 평가를 확인합니다. 각 팀을 한 번씩 평가해 주세요. 입력 정보와 피드백은 운영진만 확인합니다.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[140px_1fr]">
          <label className="text-sm font-semibold">기수<input className="hackathon-input mt-2" inputMode="numeric" autoComplete="off" placeholder="예: 42" value={generation} onChange={(e) => setGeneration(e.target.value.normalize('NFKC').replace(/\D/g, '').slice(0, 3))} aria-describedby="hackathon-generation-help" /></label>
          <label className="text-sm font-semibold">이름<input className="hackathon-input mt-2" autoComplete="name" placeholder="실명을 입력해 주세요" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        </div>
        <p id="hackathon-generation-help" className="mt-2 text-xs text-[var(--app-muted)]">기수는 숫자만 적으면 됩니다. (예: 50기 → 50)</p>
      </section>}
      {!event.open && <p role="status" className="mt-6 rounded-xl bg-[var(--app-surface-soft)] p-5 font-semibold">{event.status === 'DONE' ? '평가가 마감되었습니다. 작품 자료는 계속 보실 수 있습니다.' : event.status === 'UPCOMING' ? '아직 시작 전인 행사입니다. 평가는 개발이 끝난 뒤에 열립니다.' : '팀들이 작품을 만들고 있습니다. 평가는 개발이 끝난 뒤에 열립니다.'}</p>}
      {event.projects.length === 0 && <p className="mt-6 rounded-xl bg-[var(--app-surface-soft)] p-5">{event.status === 'DONE' ? '등록된 작품이 없습니다.' : '참가 작품은 추후 공개됩니다.'}</p>}
      <nav aria-label="작품 바로가기" className="my-6 flex flex-wrap gap-3">{event.projects.map(project => <a key={project.projectId} href={`#${project.projectId}`} className="inline-flex min-h-11 items-center rounded-full border border-[var(--app-hairline)] px-4 text-sm font-semibold">{project.title}</a>)}</nav>
      <div className="space-y-6">{event.projects.map(project => <ProjectEvaluation key={`${eventId}:${project.projectId}`} eventId={eventId} project={project} identity={identity} open={event.open} />)}</div>
      <p className="mt-8 text-sm leading-7 text-[var(--app-muted)]">{event.open ? '작품을 살펴봐 주셔서 감사합니다.' : '이 페이지는 행사 기록으로 보관됩니다.'}</p>
    </>}
  </main></div>
}
