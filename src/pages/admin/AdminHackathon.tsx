import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { CRITERIA, STATUS_META, summarizeHackathon } from '../../features/hackathon/hackathon'
import HackathonScoreForm from '../../features/hackathon/HackathonScoreForm'
import HackathonProjectEditor from './HackathonProjectEditor'
import HackathonStatusBadge from '../../features/hackathon/HackathonStatusBadge'
import {
  createHackathonEvent, createHackathonProject, deleteEventReview, deleteHackathonMaterial, deleteHackathonProject,
  getAdminHackathonEvent, listAdminHackathonEvents, listEventReviews, publishHackathonEvent,
  saveEventChairReview, setEventOpen, setEventResultsPublished, updateHackathonEvent, updateHackathonProject, uploadHackathonMaterial,
  type AdminHackathonEvent, type HackathonEventWrite, type HackathonMaterial, type HackathonProject,
  type HackathonReview,
} from '../../services/hackathonApi'
import '../../styles/hackathon.css'

const scoreText = (score: number | null) => score === null ? '미집계' : `${score.toFixed(2)}점`
const eventPath = (id: number) => `/hackathon/${id}`
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.'
const inputClass = 'hackathon-input mt-2'
const actionClass = 'apple-action-secondary min-h-11 px-4 text-sm'
const materialKinds: HackathonMaterial['kind'][] = ['proposal', 'presentation', 'video', 'poster', 'other']

function EventEditor({ event, busy, error, save }: { event?: AdminHackathonEvent; busy: boolean; error?: string; save: (payload: HackathonEventWrite) => Promise<boolean> }) {
  const [draft, setDraft] = useState<HackathonEventWrite>({ title: event?.title ?? '', year: event?.year ?? new Date().getFullYear(), semester: event?.semester ?? 1, theme: event?.theme ?? '', introduction: event?.introduction ?? '', rules: event?.rules ?? '', startsAt: event?.startsAt?.slice(0, 16) ?? null, endsAt: event?.endsAt?.slice(0, 16) ?? null })
  const submit = async (e: FormEvent) => { e.preventDefault(); await save({ ...draft, title: draft.title.trim(), theme: draft.theme.trim(), introduction: draft.introduction.trim(), rules: draft.rules.trim() }) }
  const periodError = Boolean(draft.startsAt) !== Boolean(draft.endsAt) ? '시작과 종료를 함께 입력해 주세요. 둘 다 비우면 미정으로 표시됩니다.'
    : draft.startsAt && draft.endsAt && draft.startsAt > draft.endsAt ? '종료가 시작보다 빠를 수 없습니다.' : ''
  return <form onSubmit={submit} aria-label={event ? `${event.title} 행사 편집` : '새 해커톤 작성'} className="hackathon-project space-y-4">
    <h3 className="text-lg font-bold">{event ? '해커톤 글 편집' : '새 해커톤 글 작성'}</h3>
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-sm font-semibold">해커톤 이름<input required maxLength={120} className={inputClass} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="2027년 1학기 해커톤" /></label>
      <label className="text-sm font-semibold">연도<input required type="number" min="2000" max="2200" className={inputClass} value={draft.year} onChange={e => setDraft({ ...draft, year: Number(e.target.value) })} /></label>
      <label className="text-sm font-semibold">학기<select className={inputClass} value={draft.semester} onChange={e => setDraft({ ...draft, semester: Number(e.target.value) as 1 | 2 })}><option value="1">1학기</option><option value="2">2학기</option></select></label>
    </div>
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="text-sm font-semibold">개발 기간 (한국 시간 기준 · 지난 행사도 기록할 수 있어요)</legend>
      <label className="text-sm font-semibold">개발 시작 (한국 시간)<input type="datetime-local" className={inputClass} value={draft.startsAt ?? ''} onChange={e => setDraft({ ...draft, startsAt: e.target.value || null })} /></label>
      <label className="text-sm font-semibold">개발 종료 (한국 시간)<input type="datetime-local" className={inputClass} value={draft.endsAt ?? ''} onChange={e => setDraft({ ...draft, endsAt: e.target.value || null })} /></label>
      {periodError && <p role="alert" className="text-sm text-[var(--app-danger)] sm:col-span-2">{periodError}</p>}
    </fieldset>
    <label className="block text-sm font-semibold">주제<input maxLength={200} className={inputClass} value={draft.theme} onChange={e => setDraft({ ...draft, theme: e.target.value })} /></label>
    <label className="block text-sm font-semibold">소개<textarea maxLength={10000} rows={4} className={inputClass} value={draft.introduction} onChange={e => setDraft({ ...draft, introduction: e.target.value })} /></label>
    <label className="block text-sm font-semibold">평가 안내·규칙<textarea maxLength={10000} rows={4} className={inputClass} value={draft.rules} onChange={e => setDraft({ ...draft, rules: e.target.value })} /></label>
    <button disabled={busy || Boolean(periodError) || !draft.title.trim() || !Number.isInteger(draft.year) || draft.year < 2000 || draft.year > 2200} className="apple-action-primary min-h-11 px-5 text-sm disabled:opacity-50">{busy ? '저장 중…' : event ? '글 저장' : '초안 만들기'}</button>
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
  </form>
}

function MaterialEditor({ eventId, project, busy, save }: { eventId: number; project?: HackathonProject; busy: boolean; save: (file: File, projectId: string | null, kind: HackathonMaterial['kind'], label: string) => Promise<boolean> }) {
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<HackathonMaterial['kind']>('other')
  const [label, setLabel] = useState('')
  const submit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!file) return; const form = e.currentTarget; if (await save(file, project?.projectId ?? null, kind, label.trim())) { form.reset(); setFile(null); setKind('other'); setLabel('') } }
  return <form onSubmit={submit} aria-label={`${(project?.title || project?.teamName) ?? '행사'} 자료 올리기`} className="grid gap-3 rounded-xl border border-[var(--app-hairline)] p-4 sm:grid-cols-2">
    <label className="text-sm font-semibold">자료 파일<input required type="file" className={inputClass} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
    <label className="text-sm font-semibold">자료 종류<select className={inputClass} value={kind} onChange={e => setKind(e.target.value as HackathonMaterial['kind'])}>{materialKinds.map(value => <option key={value} value={value}>{({ proposal: '계획서', presentation: '발표 자료', video: '시연 영상', poster: '포스터', other: '기타 자료' })[value]}</option>)}</select></label>
    <label className="text-sm font-semibold">표시 이름<input maxLength={120} className={inputClass} value={label} onChange={e => setLabel(e.target.value)} placeholder="비우면 파일명 표시" /></label>
    <button disabled={busy || !file || !Number.isSafeInteger(eventId)} className="apple-action-secondary min-h-11 px-4 text-sm disabled:opacity-50">자료 올리기</button>
  </form>
}

export default function AdminHackathon() {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const requestedId = Number(params.get('event') ?? 1)
  const eventId = Number.isSafeInteger(requestedId) && requestedId > 0 ? requestedId : 1
  const events = useQuery({ queryKey: ['admin', 'hackathon', 'events'], queryFn: listAdminHackathonEvents })
  const detail = useQuery({ queryKey: ['admin', 'hackathon', 'event', eventId], queryFn: () => getAdminHackathonEvent(eventId), enabled: events.isSuccess })
  const reviews = useQuery({ queryKey: ['admin', 'hackathon', 'reviews', eventId], queryFn: () => listEventReviews(eventId), enabled: events.isSuccess })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [newEvent, setNewEvent] = useState(false)
  const [editingProject, setEditingProject] = useState<string | null>(null)
  const event = detail.data
  const guarded = Boolean(event?.open || reviews.isPending || reviews.isError || reviews.data?.length)
  const resultsBlocked = event && !event.resultsPublished ? (!event.published ? '결과 공개: 먼저 해커톤 글을 공개해 주세요.' : event.status !== 'DONE' ? `결과 공개: 완료 상태(평가 마감 + 개발 기간 종료)에서만 켤 수 있습니다. 지금은 '${STATUS_META[event.status].label}'입니다.` : '') : ''
  const rows = event && reviews.data ? summarizeHackathon(reviews.data, event.projects.filter(project => project.published !== false)) : []
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['admin', 'hackathon'] }),
      client.invalidateQueries({ queryKey: ['hackathon', 'events'] }),
      client.invalidateQueries({ queryKey: ['hackathon', 'event', eventId] }),
    ])
  }
  const act = async (work: () => Promise<unknown>, success: string, inForm = false) => {
    if (pending) return false
    setPending(true); setError(''); setFormError(''); setMessage('')
    try { await work(); await refresh(); setMessage(success); return true }
    catch (cause) { (inForm ? setFormError : setError)(errorText(cause)); return false }
    finally { setPending(false) }
  }
  const remove = async (title: string, message: string, work: () => Promise<void>) => {
    if (!await confirmDialog({ title, message, confirmText: '삭제', tone: 'danger' })) return
    await act(work, '삭제했습니다.')
  }
  const removeReview = async (review: HackathonReview, title: string) => {
    if (removingId !== null) return
    const name = review.chair ? '회장' : `${review.generation}기 ${review.name}`
    if (!await confirmDialog({ title: '해커톤 평가 삭제', message: `${title}의 ${name} 평가와 피드백을 삭제할까요? 삭제 후 복구할 수 없습니다. ${review.chair ? '회장 점수도 집계에서 제외됩니다.' : '접수가 열려 있으면 같은 기수·이름으로 다시 평가할 수 있습니다.'}`, confirmText: '평가 삭제', tone: 'danger' })) return
    setRemovingId(review.id); setError(''); setMessage('')
    try { await deleteEventReview(eventId, review.id); await refresh(); setMessage(`${title}의 ${name} 평가를 삭제했습니다.`) }
    catch (cause) { setError(errorText(cause)) }
    finally { setRemovingId(null) }
  }
  if (events.isPending) return <p role="status">해커톤 목록을 불러오는 중…</p>
  if (events.isError) return <div role="alert">해커톤 목록을 불러오지 못했습니다. <button onClick={() => events.refetch()} className={actionClass}>다시 불러오기</button></div>
  return <section className="space-y-6" aria-label="해커톤 평가 관리">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">해커톤 평가·행사 관리</h2><p className="mt-2 text-sm text-[var(--app-muted)]">행사별 글·팀·자료·평가를 관리합니다.</p></div>
      <div className="flex flex-wrap gap-2">
        <Link to={'/admin?tab=club-forms&category=HACKATHON&hackathon=' + eventId} className={actionClass}>팀 신청 양식 관리</Link>
        {event?.published && <Link to={eventPath(eventId)} className={actionClass}>공개 페이지</Link>}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm font-semibold">관리할 해커톤<select aria-label="관리할 해커톤" className={inputClass} value={events.data.some(item => item.id === eventId) ? eventId : ''} onChange={e => { setParams(previous => { previous.set('event', e.target.value); return previous }); setMessage(''); setError(''); setFormError(''); setEditingProject(null) }}><option value="" disabled>선택</option>{events.data.map(item => <option key={item.id} value={item.id}>{item.title}{item.published ? '' : ' · 초안'} · {STATUS_META[item.status].label}</option>)}</select></label><button type="button" className={actionClass} onClick={() => setNewEvent(value => !value)}>{newEvent ? '작성 닫기' : '새 해커톤 작성'}</button></div>
    {newEvent && <EventEditor busy={pending} error={formError} save={payload => act(async () => { const created = await createHackathonEvent(payload); setParams(previous => { previous.set('event', String(created.id)); return previous }); setNewEvent(false) }, '해커톤 초안을 만들었습니다.', true)} />}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
    {detail.isPending && <p role="status">행사 내용을 불러오는 중…</p>}
    {detail.isError && <p role="alert">행사를 불러오지 못했습니다. <button type="button" className={actionClass} onClick={() => detail.refetch()}>다시 불러오기</button></p>}
    {event && <div key={event.id} className="space-y-6">
      <div className="flex flex-wrap items-center gap-3"><strong>{event.published ? '공개 중' : '초안'} · {event.open ? '평가 접수 중' : '평가 마감'}</strong>
        <button type="button" disabled={pending || (event.published && (event.open || reviews.isPending || reviews.isError || Boolean(reviews.data?.length)))} className={actionClass} onClick={() => act(() => publishHackathonEvent(eventId, !event.published), event.published ? '공개를 중단했습니다.' : '해커톤 글을 공개했습니다.')}>{event.published ? '공개 중단' : '글 공개'}</button>
        <button type="button" disabled={pending || (!event.open && (!event.published || !event.projects.some(project => project.published !== false)))} className={actionClass} onClick={() => act(() => setEventOpen(eventId, !event.open), event.open ? '평가를 마감했습니다.' : '평가를 열었습니다.')}>{event.open ? '평가 마감하기' : '평가 다시 열기'}</button>
        <button type="button" className={actionClass} onClick={() => refresh()}>집계 새로고침</button>
        <HackathonStatusBadge status={event.status} />
        <button type="button" aria-pressed={event.resultsPublished} disabled={pending || Boolean(resultsBlocked)} aria-describedby={resultsBlocked ? 'hackathon-results-reason' : undefined} className={actionClass} onClick={() => act(() => setEventResultsPublished(eventId, !event.resultsPublished), event.resultsPublished ? '결과 공개를 중단했습니다.' : '결과를 공개했습니다.')}>{event.resultsPublished ? '결과 공개 중 · 비공개로 전환' : '결과 공개'}</button>
        {resultsBlocked && <p id="hackathon-results-reason" className="w-full text-sm text-[var(--app-muted)]">{resultsBlocked}</p>}
      </div>
      <EventEditor key={event.id} event={event} busy={pending} error={formError} save={payload => act(() => updateHackathonEvent(eventId, payload), '해커톤 글을 저장했습니다.', true)} />
      <section className="space-y-4"><h3 className="text-lg font-bold">행사 자료</h3><p className="text-sm text-[var(--app-muted)]">개회식 안내와 규칙 자료를 이 행사에 올립니다.</p>
        {event.materials.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--app-hairline)] p-3"><span>{item.label || item.originalName}</span>{event.published && <a href={item.url} target="_blank" rel="noreferrer" className="underline">열기</a>}<button type="button" disabled={pending || guarded} className={actionClass} onClick={() => remove('행사 자료 삭제', `${item.originalName} 파일을 삭제할까요?`, () => deleteHackathonMaterial(eventId, item.id))}>삭제</button></div>)}
        {!guarded && event.materials.length < 20 && <MaterialEditor eventId={eventId} busy={pending} save={(file, projectId, kind, label) => act(() => uploadHackathonMaterial(eventId, file, projectId, kind, label), '행사 자료를 올렸습니다.')} />}
      </section>
      <section className="space-y-4"><h3 className="text-lg font-bold">참가 팀</h3>{guarded && <p className="text-sm text-[var(--app-muted)]">평가 중이거나 제출된 평가가 있으면 팀과 자료 목록을 바꿀 수 없습니다. 소개와 링크는 수정할 수 있습니다.</p>}
        {event.projects.map(project => <article key={project.projectId} className="space-y-4 rounded-xl border border-[var(--app-hairline)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-bold">{project.teamName || project.title}</h4><p className="mt-1 text-sm text-[var(--app-muted)]">{project.teamName && project.title && project.title !== project.teamName ? project.title + ' · ' : ''}{project.published === false ? '팀 초안' : '공개 작품'}</p></div><button type="button" className={actionClass} aria-expanded={editingProject === project.projectId} onClick={() => setEditingProject(editingProject === project.projectId ? null : project.projectId)}>{editingProject === project.projectId ? '편집 닫기' : '팀·작품 편집'}</button><button type="button" disabled={pending || guarded} className={actionClass} onClick={() => remove('팀 삭제', `${project.teamName || project.title} 팀을 삭제할까요?`, () => deleteHackathonProject(eventId, project.projectId))}>팀 삭제</button></div>{editingProject === project.projectId && <HackathonProjectEditor key={project.projectId} eventId={eventId} project={project} busy={pending} guarded={guarded} save={payload => act(() => updateHackathonProject(eventId, project.projectId, payload), `${project.teamName || project.title} 팀을 저장했습니다.`).then(ok => { if (ok) setEditingProject(null); return ok })} />}
          {project.materials.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 text-sm"><span>{item.label || item.originalName}</span>{event.published && project.published !== false && <a href={item.url} target="_blank" rel="noreferrer" className="underline">열기</a>}<button type="button" disabled={pending || guarded} className={actionClass} onClick={() => remove('자료 삭제', `${item.originalName} 파일을 삭제할까요?`, () => deleteHackathonMaterial(eventId, item.id))}>삭제</button></div>)}
          {!guarded && project.materials.length < 20 && <MaterialEditor eventId={eventId} project={project} busy={pending} save={(file, projectId, kind, label) => act(() => uploadHackathonMaterial(eventId, file, projectId, kind, label), `${project.teamName || project.title} 자료를 올렸습니다.`)} />}
        </article>)}
        {!guarded && event.projects.length < 100 && <details className="hackathon-project"><summary className="cursor-pointer font-bold">새 팀 등록</summary><div className="mt-4"><HackathonProjectEditor eventId={eventId} busy={pending} guarded={guarded} save={payload => act(() => createHackathonProject(eventId, payload), '팀을 추가했습니다.')} /></div></details>}
      </section>
      {reviews.isPending && <p role="status">평가를 불러오는 중…</p>}
      {reviews.isError && <p role="alert">평가를 불러오지 못했습니다. <button type="button" className={actionClass} onClick={() => reviews.refetch()}>다시 불러오기</button></p>}
      {reviews.data && <>
        <div role="region" aria-label="해커톤 순위표" tabIndex={0} className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="mb-3 text-left text-sm text-[var(--app-muted)]">모든 작품의 양쪽 평가가 모이면 순위가 표시됩니다. 마감 전 점수와 순위는 잠정 집계입니다.</caption><thead><tr>{['순위', '작품', '졸업생 수', '졸업생 평균', '회장 점수', '최종 점수'].map(label => <th key={label} scope="col" className="border-b border-[var(--app-hairline)] p-3">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.project.projectId}>{[row.rank ?? '대기', row.project.title, `${row.alumniCount}명`, scoreText(row.alumniAverage), scoreText(row.chairScore), scoreText(row.finalScore)].map((value, index) => <td key={index} className="border-b border-[var(--app-hairline)] p-3">{value}</td>)}</tr>)}</tbody></table></div>
        {rows.map(row => <article key={row.project.projectId} className="hackathon-project"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">{row.project.title} · 회장 평가</h3>{row.chair && <button type="button" aria-label={`${row.project.title} 회장 평가 삭제`} disabled={removingId !== null} onClick={() => removeReview(row.chair, row.project.title)} className={`${actionClass} text-[var(--app-danger)]`}>{removingId === row.chair.id ? '삭제 중…' : '회장 평가 삭제'}</button>}</div>
          {event.published && <HackathonScoreForm key={JSON.stringify(row.chair ?? null)} projectId={`chair-${row.project.projectId}`} initial={row.chair} submitLabel="회장 평가 저장" onSubmit={async scores => { await saveEventChairReview(eventId, row.project.projectId, scores); await refresh(); setMessage(`${row.project.title} 회장 평가를 저장했습니다.`) }} />}
          <details className="mt-6 border-t border-[var(--app-hairline)] pt-5"><summary className="cursor-pointer text-sm font-bold">졸업생 평가·피드백 {row.alumniCount}건</summary>{row.alumni.length === 0 && <p className="mt-4 text-sm text-[var(--app-muted)]">아직 접수된 평가가 없습니다.</p>}<ul className="mt-4 space-y-4">{row.alumni.map(review => <li key={review.id} className="rounded-xl border border-[var(--app-hairline)] p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><p className="min-w-0 break-words font-semibold">{review.generation}기 {review.name}</p><button type="button" aria-label={`${review.generation}기 ${review.name} 평가 삭제`} disabled={removingId !== null} onClick={() => removeReview(review, row.project.title)} className={`${actionClass} text-[var(--app-danger)]`}>{removingId === review.id ? '삭제 중…' : '평가 삭제'}</button></div><p className="mt-2 text-xs leading-6 text-[var(--app-muted)]">{CRITERIA.map(({ key, label }) => `${label} ${review[key]}점`).join(' · ')}</p><p className="mt-2 whitespace-pre-wrap break-words leading-7">{review.feedback || '피드백 없음'}</p></li>)}</ul></details>
          <button type="button" className={`${actionClass} mt-5`} onClick={async () => { const feedbacks = [...row.alumni, ...(row.chair ? [row.chair] : [])].filter(review => review.feedback?.trim()); const text = `${row.project.title} · ${event.title} 피드백\n\n${feedbacks.length ? feedbacks.map((review, index) => `${index + 1}. ${review.feedback}`).join('\n\n') : '아직 작성된 피드백이 없습니다.'}`; try { await navigator.clipboard.writeText(text); setMessage(`${row.project.title} 피드백을 복사했습니다. 평가자 이름은 포함하지 않았습니다.`); setError('') } catch { setError('클립보드에 복사하지 못했습니다. 위 피드백을 선택해 복사해 주세요.') } }}>팀에 전달할 피드백 복사</button>
        </article>)}
      </>}
    </div>}
  </section>
}
