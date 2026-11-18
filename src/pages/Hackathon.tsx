import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Copy } from 'lucide-react'
import PageHeading from '../components/PageHeading'
import { useAuth } from '../contexts/useAuth'
import { getHackathon, submitHackathonReview, type AlumniIdentity } from '../services/hackathonApi'
import { HACKATHON_PROJECTS } from '../features/hackathon/hackathon'
import HackathonScoreForm from '../features/hackathon/HackathonScoreForm'
import '../styles/site-pages.css'
import '../styles/hackathon.css'

function ProjectEvaluation({ project, identity, open }: { project: typeof HACKATHON_PROJECTS[number]; identity: AlumniIdentity | null; open: boolean }) {
  const [submittedFor, setSubmittedFor] = useState('')
  const identityKey = identity ? `${identity.generation}:${identity.name.normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase('en')}` : ''
  const submitted = Boolean(identityKey && submittedFor === identityKey)
  return <article id={project.id} className="hackathon-project" aria-labelledby={`${project.id}-title`}>
    <header className="mb-5">
      <p className="text-sm font-semibold text-[var(--app-muted)]">{project.author}</p>
      <h2 id={`${project.id}-title`} className="mt-1 text-2xl font-bold">{project.title}</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--app-muted)]">{project.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {project.live && <a href={project.live} target="_blank" rel="noreferrer" className="apple-action-primary inline-flex min-h-11 items-center gap-1 px-4 text-sm">작품 체험 <ArrowUpRight size={14} aria-hidden="true" /></a>}
        <a href={project.github} target="_blank" rel="noreferrer" className="apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm">GitHub</a>
        <a href={project.proposal} target="_blank" rel="noreferrer" className="apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm">계획서 PDF</a>
        <a href={project.presentation} target="_blank" rel="noreferrer" className="apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm">발표 자료 {project.presentation.endsWith('.pptx') ? 'PPTX' : 'PDF'}</a>
      </div>
    </header>
    <details className="mb-6 rounded-xl border border-[var(--app-hairline)] p-4">
      <summary className="cursor-pointer text-sm font-semibold">{project.title} 시연 영상 보기</summary>
      <video controls playsInline preload="none" poster={project.poster} aria-label={`${project.title} 시연 영상`} className="mt-4 aspect-video w-full rounded-lg bg-black">
        <source src={project.video} type="video/mp4" />
        <a href={project.video}>시연 영상 다운로드</a>
      </video>
      <a href={project.video} download className="mt-3 inline-block text-sm text-[var(--app-accent-text)] underline">영상 다운로드</a>
    </details>
    {submitted ? <p role="status" className="rounded-xl bg-[var(--app-accent-soft)] p-5 text-sm font-semibold">{project.title} 평가가 접수되었습니다. 소중한 평가와 피드백 감사합니다.</p> : <HackathonScoreForm projectId={project.id} disabled={!open || !identity} note={!identity ? '먼저 위에서 기수와 이름을 입력해 주세요.' : '제출 후에는 수정할 수 없습니다. 점수와 피드백을 확인해 주세요.'} onSubmit={async (scores) => {
      await submitHackathonReview({ ...scores, ...identity, projectId: project.id })
      setSubmittedFor(identityKey)
    }} />}
  </article>
}

export default function Hackathon() {
  const { user } = useAuth()
  const [generation, setGeneration] = useState('')
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const settings = useQuery({ queryKey: ['hackathon', 'settings'], queryFn: getHackathon, retry: 1, refetchOnWindowFocus: true })
  const normalizedName = name.normalize('NFKC').trim()
  const identity = /^\d{1,3}$/.test(generation) && Number(generation) >= 1 && Number(generation) <= 60 && normalizedName.replace(/\s/g, '').length >= 2 && normalizedName.length <= 40
    ? { generation: Number(generation), name: normalizedName } : null
  const open = settings.data?.open === true
  return <div className="site-page"><main className="site-page-inner hackathon-page">
    <PageHeading>COM’s 해커톤 2026</PageHeading>
    <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--app-muted)]">선배님들의 경험으로 후배들의 작품을 살펴봐 주세요.<br />로그인 없이 기수와 이름만 입력하면 평가에 참여하실 수 있습니다.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" className="apple-action-secondary inline-flex min-h-11 items-center gap-2 px-4 text-sm" onClick={async () => {
        try { await navigator.clipboard.writeText(`${window.location.origin}/hackathon/share`); setCopied(true); setCopyError(false) } catch { setCopied(false); setCopyError(true) }
      }}><Copy size={14} aria-hidden="true" />{copied ? '링크 복사됨' : '평가 링크 복사'}</button>
      {user?.role === 'ADMIN' && <Link to="/admin?tab=hackathon" className="apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm">평가 집계·회장 채점</Link>}
    </div>
    {copyError && <p role="alert" className="mt-3 break-all text-sm">자동 복사가 지원되지 않습니다. 주소를 길게 눌러 복사해 주세요: <a href="/hackathon/share" className="select-all text-[var(--app-accent-text)] underline">{window.location.origin}/hackathon/share</a></p>}
    <section className="hackathon-intro mt-8" aria-labelledby="hackathon-theme">
      <p className="text-sm font-semibold text-[var(--app-accent-text)]">이번 주제</p>
      <h2 id="hackathon-theme" className="mt-2 text-3xl font-bold">전쟁</h2>
      <p className="mt-3 text-lg font-semibold leading-8">전쟁이 일어났을 때, 사람들에게 무엇이 필요할까요?</p>
      <p className="mt-2 text-sm leading-7 text-[var(--app-muted)]">그 문제를 해결하는 서비스를 만드는 해커톤입니다. 개발 기간은 11월 8일 18:00부터 11월 15일 04:00까지입니다.</p>
      <p className="mt-4 text-sm leading-7">5개 항목을 각 20점, 총 100점으로 평가합니다. 최종 점수는 <strong>졸업생 평균 50% + 회장 평가 50%</strong>이며, 동점이면 완성도 → 주제 적합성 순으로 결정합니다.</p>
      <a href="/hackathon-2026/opening.pptx" className="mt-4 inline-block text-sm font-semibold text-[var(--app-accent-text)] underline">개회식 안내·전체 규칙 PPTX</a>
    </section>
    <section className="hackathon-identity mt-6" aria-labelledby="hackathon-identity-title">
      <h2 id="hackathon-identity-title" className="text-lg font-bold">평가자 정보</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">기수와 이름으로 팀별 중복 평가를 확인합니다. 각 팀을 한 번씩 평가해 주세요. 입력 정보와 피드백은 운영진만 확인합니다.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[140px_1fr]">
        <label className="text-sm font-semibold">기수
          <input className="hackathon-input mt-2" inputMode="numeric" autoComplete="off" placeholder="예: 42" value={generation} onChange={(event) => setGeneration(event.target.value)} maxLength={3} aria-describedby="hackathon-generation-help" />
        </label>
        <label className="text-sm font-semibold">이름
          <input className="hackathon-input mt-2" autoComplete="name" placeholder="실명을 입력해 주세요" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
        </label>
      </div>
      <p id="hackathon-generation-help" className="mt-2 text-xs text-[var(--app-muted)]">기수는 1~60 사이 숫자만 입력해 주세요.</p>
    </section>
    {settings.isPending && <p role="status" className="mt-6">평가 접수 상태를 확인하는 중…</p>}
    {settings.isError && <div role="alert" className="mt-6 flex flex-wrap items-center gap-3"><span>평가 접수 상태를 확인하지 못했습니다.</span><button type="button" onClick={() => settings.refetch()} className="apple-action-secondary min-h-11 px-4 text-sm">다시 확인</button></div>}
    {settings.data && !open && <p role="status" className="mt-6 rounded-xl bg-[var(--app-surface-soft)] p-5 font-semibold">평가가 마감되었습니다. 작품 자료는 계속 보실 수 있습니다.</p>}
    <nav aria-label="평가할 작품" className="my-6 flex flex-wrap gap-3">{HACKATHON_PROJECTS.map((project) => <a key={project.id} href={`#${project.id}`} className="inline-flex min-h-11 items-center rounded-full border border-[var(--app-hairline)] px-4 text-sm font-semibold">{project.title}</a>)}</nav>
    <div className="space-y-6">{HACKATHON_PROJECTS.map((project) => <ProjectEvaluation key={project.id} project={project} identity={identity} open={open} />)}</div>
    <p className="mt-8 text-sm leading-7 text-[var(--app-muted)]">세 작품을 모두 살펴봐 주시면 더 공정한 평가에 도움이 됩니다. 참여해 주셔서 감사합니다.</p>
  </main></div>
}
