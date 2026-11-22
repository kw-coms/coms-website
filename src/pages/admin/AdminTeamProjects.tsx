import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { ListSearch } from '../../components/common/ListTools'
import { StatusChip, SubmissionView } from '../../features/teamProjects/SubmissionParts'
import {
  formatWhen, isPeriod, milestoneWhen, STATUS_LABEL, toInputValue, toWriteValue,
} from '../../features/teamProjects/teamProjects'
import { matchesQuery } from '../../utils/listTools'
import { listMembers } from '../../services/adminApi'
import { queryKeys } from '../../services/queryKeys'
import {
  addTeamMember, createMilestone, createTeam, createTeamProject, deleteMilestone, deleteTeam, deleteTeamProject,
  getTeamProject, getTeamProjectBoard, listTeamProjects, listTeamSubmissions, removeTeamMember, reorderMilestones,
  updateMilestone, updateTeam, updateTeamProject,
  type BoardTeam, type Milestone, type MilestoneWrite, type Team, type TeamProjectDetail, type TeamWrite,
} from '../../services/teamProjectApi'
import '../../styles/team-projects.css'

const errorText = (cause: unknown) => cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.'
const actionClass = 'apple-action-secondary min-h-11 px-4 text-sm'
const primaryClass = 'apple-action-primary min-h-11 px-5 text-sm disabled:opacity-50'

/** Runs a write. A failure goes to `onError` (inside the form that asked) or, without one, to the top of the panel. */
type Act = (work: () => Promise<unknown>, success: string, onError?: (message: string) => void) => Promise<boolean>

function ProgramForm({ program, busy, save }: { program?: TeamProjectDetail; busy: boolean; save: (draft: { title: string; description: string; open: boolean }, onError: (message: string) => void) => Promise<boolean> }) {
  const [formError, setFormError] = useState('')
  const [title, setTitle] = useState(program?.title ?? '')
  const [description, setDescription] = useState(program?.description ?? '')
  const [open, setOpen] = useState(program?.open ?? true)
  const submit = async (event: FormEvent) => { event.preventDefault(); setFormError(''); await save({ title: title.trim(), description: description.trim(), open }, setFormError) }
  return <form onSubmit={submit} aria-label={program ? '프로그램 정보' : '새 팀프 만들기'} className="tp-card space-y-4">
    <h3 className="text-lg font-bold">{program ? '프로그램 정보' : '새 팀프 만들기'}</h3>
    <label className="block text-sm font-semibold">제목<input required maxLength={120} className="tp-input mt-2" value={title} onChange={event => setTitle(event.target.value)} placeholder="2026-2 팀 프로젝트" /></label>
    <label className="block text-sm font-semibold">설명<textarea maxLength={5000} rows={3} className="tp-input mt-2" value={description} onChange={event => setDescription(event.target.value)} /></label>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={open} onChange={event => setOpen(event.target.checked)} />진행 중 (끄면 마감되어 제출을 받지 않습니다)</label>
    {formError && <p role="alert" className="tp-field-error">{formError}</p>}
    <button disabled={busy || !title.trim()} className={primaryClass}>{program ? '저장' : '만들기'}</button>
  </form>
}

type Kind = 'deadline' | 'event' | 'period'
const KINDS: { id: Kind; label: string; help: string }[] = [
  { id: 'deadline', label: '제출 마감', help: '팀이 내용을 제출하는 일정입니다. 예: 개발 계획서 제출. 마감이 지나면 늦은 제출로 표시됩니다.' },
  { id: 'event', label: '일정·행사', help: '제출 없이 알리는 하루짜리 일정입니다. 예: 최종 발표 18:00.' },
  { id: 'period', label: '기간', help: '시작과 종료가 있고 제출은 없는 기간입니다. 예: 시험·보강 기간.' },
]
const kindOf = (milestone?: Milestone): Kind => !milestone || milestone.submittable ? 'deadline' : isPeriod(milestone) ? 'period' : 'event'

function MilestoneForm({ milestone, busy, save, cancel }: { milestone?: Milestone; busy: boolean; save: (draft: MilestoneWrite, onError: (message: string) => void) => Promise<boolean>; cancel?: () => void }) {
  const [kind, setKind] = useState<Kind>(kindOf(milestone))
  const [allDay, setAllDay] = useState(milestone?.allDay ?? false)
  const [draft, setDraft] = useState({
    title: milestone?.title ?? '', description: milestone?.description ?? '',
    startsAt: toInputValue(milestone?.startsAt ?? null, milestone?.allDay), dueAt: toInputValue(milestone?.dueAt ?? null, milestone?.allDay),
  })
  const [formError, setFormError] = useState('')
  const changeAllDay = (next: boolean) => {
    setAllDay(next)
    setDraft(current => ({
      ...current,
      startsAt: current.startsAt ? (next ? current.startsAt.slice(0, 10) : `${current.startsAt.slice(0, 10)}T00:00`) : '',
      dueAt: current.dueAt ? (next ? current.dueAt.slice(0, 10) : `${current.dueAt.slice(0, 10)}T23:59`) : '',
    }))
  }
  const changeKind = (next: Kind) => { setKind(next); if (next !== 'period') setDraft(current => ({ ...current, startsAt: '' })) }
  const hasStart = kind === 'period'   // 시작은 기간에만 쓴다. 제출 마감과 일정·행사는 한 시각뿐이다.
  const startLabel = '시작'
  const endLabel = kind === 'period' ? '종료' : kind === 'event' ? '일시 (선택)' : '마감 (선택)'
  const rangeError = draft.startsAt && draft.dueAt && draft.dueAt < draft.startsAt ? '종료(마감)는 시작보다 빠를 수 없습니다.'
    : kind === 'period' && (!draft.startsAt || !draft.dueAt) ? '기간은 시작과 종료를 모두 입력해 주세요.' : ''
  const inputType = allDay ? 'date' : 'datetime-local'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (rangeError) return
    setFormError('')
    const saved = await save({
      title: draft.title.trim(), description: draft.description.trim(), allDay, submittable: kind === 'deadline',
      startsAt: hasStart ? toWriteValue(draft.startsAt, allDay) : null, dueAt: toWriteValue(draft.dueAt, allDay),
    }, setFormError)
    if (saved && !milestone) { setDraft({ title: '', description: '', startsAt: '', dueAt: '' }); setKind('deadline'); setAllDay(false) }
  }
  const label = milestone ? `${milestone.title} 일정 편집` : '일정 추가'
  const help = KINDS.find(item => item.id === kind)!.help
  return <form onSubmit={submit} aria-label={label} className="grid gap-3 rounded-xl border border-[var(--app-hairline)] p-4">
    <fieldset className="tp-kinds" aria-label="일정 종류">
      {KINDS.map(item => <label key={item.id} className="tp-kind"><input type="radio" name={`kind-${milestone?.id ?? 'new'}`} checked={kind === item.id} onChange={() => changeKind(item.id)} />{item.label}</label>)}
    </fieldset>
    <p className="text-xs leading-5 text-[var(--app-muted)]">{help}</p>
    <label className="text-sm font-semibold">일정 이름<input required maxLength={120} className="tp-input mt-2" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="개발 계획서 제출" /></label>
    <label className="text-sm font-semibold">설명<textarea maxLength={2000} rows={2} className="tp-input mt-2" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="주요 기능, 기술 스택, 역할 분담, 개발 일정" /></label>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={allDay} onChange={event => changeAllDay(event.target.checked)} />시간 없음 (종일){allDay && <span className="font-normal text-[var(--app-muted)]"> — 마감은 그날 23:59까지</span>}</label>
    <div className={hasStart ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
      {hasStart && <label className="text-sm font-semibold">{startLabel}<input type={inputType} required={kind === 'period'} aria-invalid={Boolean(rangeError) || undefined} className="tp-input mt-2" value={draft.startsAt} onChange={event => setDraft({ ...draft, startsAt: event.target.value })} /></label>}
      <label className="text-sm font-semibold">{endLabel}<input type={inputType} required={kind === 'period'} aria-invalid={Boolean(rangeError) || undefined} className="tp-input mt-2" value={draft.dueAt} onChange={event => setDraft({ ...draft, dueAt: event.target.value })} /></label>
    </div>
    <p className="text-xs text-[var(--app-muted)]">시각은 모두 한국 시간 기준입니다.</p>
    {rangeError && <p role="alert" className="tp-field-error">{rangeError}</p>}
    {formError && <p role="alert" className="tp-field-error">{formError}</p>}
    <div className="flex flex-wrap gap-2"><button disabled={busy || !draft.title.trim() || Boolean(rangeError)} className={primaryClass}>{milestone ? '일정 저장' : '일정 추가'}</button>{cancel && <button type="button" className={actionClass} onClick={cancel}>취소</button>}</div>
  </form>
}

function Milestones({ program, act, busy }: { program: TeamProjectDetail; act: Act; busy: boolean }) {
  const [editing, setEditing] = useState<number | null>(null)
  const move = (index: number, delta: number) => {
    const ids = program.milestones.map(item => item.id)
    ;[ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]
    return act(() => reorderMilestones(program.id, ids), '일정 순서를 바꿨습니다.')
  }
  const remove = async (milestone: Milestone) => {
    if (!await confirmDialog({ title: '일정 삭제', message: `${milestone.title} 일정을 삭제할까요? 이 일정에 제출된 내용과 파일도 함께 삭제됩니다.`, confirmText: '삭제', tone: 'danger' })) return
    await act(() => deleteMilestone(program.id, milestone.id), '일정을 삭제했습니다.')
  }
  return <section aria-labelledby="tp-admin-milestones" className="space-y-4">
    <h3 id="tp-admin-milestones" className="text-lg font-bold">일정</h3>
    {program.milestones.length === 0 && <p className="text-sm text-[var(--app-muted)]">아직 일정이 없습니다. 아래에서 추가하세요.</p>}
    <ol className="tp-timeline">{program.milestones.map((milestone, index) => <li key={milestone.id} className="tp-milestone">
      {editing === milestone.id
        ? <MilestoneForm milestone={milestone} busy={busy} cancel={() => setEditing(null)} save={async (draft, onError) => { const saved = await act(() => updateMilestone(program.id, milestone.id, draft), '일정을 저장했습니다.', onError); if (saved) setEditing(null); return saved }} />
        : <>
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="min-w-0 break-words font-bold">{milestone.title}</h4><span className="tp-chip" data-tone={milestone.submittable ? 'accent' : undefined}>{milestone.submittable ? '제출 마감' : isPeriod(milestone) ? '기간' : '일정·행사'}</span></div>
          <p className="text-sm text-[var(--app-muted)]">{milestoneWhen(milestone)}</p>
          {milestone.description && <p className="whitespace-pre-wrap break-words text-sm leading-6">{milestone.description}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tp-icon-button" aria-label={`${milestone.title} 위로`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
            <button type="button" className="tp-icon-button" aria-label={`${milestone.title} 아래로`} disabled={busy || index === program.milestones.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
            <button type="button" className={actionClass} onClick={() => setEditing(milestone.id)}>{milestone.title} 편집</button>
            <button type="button" className={`${actionClass} text-[var(--app-danger)]`} disabled={busy} onClick={() => remove(milestone)}>삭제</button>
          </div>
        </>}
    </li>)}</ol>
    <MilestoneForm busy={busy} save={(draft, onError) => act(() => createMilestone(program.id, draft), '일정을 추가했습니다.', onError)} />
  </section>
}

type Person = { studentId: string; name: string; generation?: string | null }

/** Picks from the real member list (the one 회원 관리 uses); searches name, 기수 and 학번. */
function MemberPicker({ team, program, busy, act }: { team: Team; program: TeamProjectDetail; busy: boolean; act: Act }) {
  const [query, setQuery] = useState('')
  const [addError, setAddError] = useState('')
  const people = useQuery({ queryKey: queryKeys.admin.members(), queryFn: async () => { const data = await listMembers(); return (Array.isArray(data) ? data : []) as Person[] }, enabled: query.trim().length > 0 })
  const assigned = useMemo(() => {
    const map = new Map<string, string>()
    program.teams.forEach(item => item.members.forEach(member => member.studentId && map.set(member.studentId, item.name)))
    return map
  }, [program.teams])
  const matches = useMemo(() => (people.data ?? []).filter(person => matchesQuery(query, [person.name, person.studentId, person.generation, person.generation ? `${person.generation}기` : ''])).slice(0, 8), [people.data, query])
  return <div className="space-y-2">
    <ListSearch value={query} onChange={setQuery} label={`${team.name} 팀원 검색`} placeholder="이름·기수·학번으로 회원 검색" />
    {addError && <p role="alert" className="tp-field-error">{addError}</p>}
    {people.isError && <p role="alert" className="text-sm text-[var(--app-danger)]">회원 목록을 불러오지 못했습니다.</p>}
    {query.trim() && people.data && matches.length === 0 && <p className="text-sm text-[var(--app-muted)]">일치하는 회원이 없습니다.</p>}
    {matches.length > 0 && <ul className="tp-member-pick" aria-label="검색 결과">{matches.map(person => {
      const elsewhere = assigned.get(person.studentId)
      return <li key={person.studentId}>
        <span className="min-w-0 break-words text-sm"><strong>{person.name}</strong> <span className="text-[var(--app-muted)]">{person.generation ? `${person.generation}기 · ` : ''}{person.studentId}</span></span>
        {elsewhere ? <span className="tp-chip">{elsewhere} 소속</span>
          : <button type="button" className="tp-text-button" disabled={busy} aria-label={`${person.name} ${team.name}에 추가`} onClick={async () => { if (await act(() => addTeamMember(program.id, team.id, person.studentId), `${person.name} 님을 ${team.name}에 추가했습니다.`, setAddError)) setQuery('') }}>추가</button>}
      </li>
    })}</ul>}
  </div>
}

function TeamEditor({ program, team, busy, act }: { program: TeamProjectDetail; team?: Team; busy: boolean; act: Act }) {
  const [draft, setDraft] = useState<TeamWrite>({ name: team?.name ?? '', topic: team?.topic ?? '', intro: team?.intro ?? '' })
  const [formError, setFormError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    const payload = { name: draft.name.trim(), topic: draft.topic.trim(), intro: draft.intro.trim() }
    const saved = await act(() => team ? updateTeam(program.id, team.id, payload) : createTeam(program.id, payload), team ? `${payload.name} 팀을 저장했습니다.` : '팀을 만들었습니다.', setFormError)
    if (saved && !team) setDraft({ name: '', topic: '', intro: '' })
  }
  const removeTeam = async () => {
    if (team && await confirmDialog({ title: '팀 삭제', message: `${team.name} 팀을 삭제할까요? 팀원 배정과 이 팀의 제출·파일이 모두 삭제됩니다.`, confirmText: '삭제', tone: 'danger' })) await act(() => deleteTeam(program.id, team.id), '팀을 삭제했습니다.')
  }
  return <article className="space-y-4 rounded-xl border border-[var(--app-hairline)] p-4" aria-label={team ? `${team.name} 팀` : '새 팀'}>
    <form onSubmit={submit} aria-label={team ? `${team.name} 팀 정보` : '새 팀 만들기'} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">팀 이름<input required maxLength={60} className="tp-input mt-2" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="text-sm font-semibold">주제 (선택)<input maxLength={200} className="tp-input mt-2" value={draft.topic} onChange={event => setDraft({ ...draft, topic: event.target.value })} /></label>
      </div>
      <label className="text-sm font-semibold">소개 (선택)<textarea maxLength={2000} rows={2} className="tp-input mt-2" value={draft.intro} onChange={event => setDraft({ ...draft, intro: event.target.value })} /></label>
      {formError && <p role="alert" className="tp-field-error">{formError}</p>}
      <div className="flex flex-wrap gap-2"><button disabled={busy || !draft.name.trim()} className={team ? actionClass : primaryClass}>{team ? '팀 정보 저장' : '팀 만들기'}</button>
        {team && <button type="button" disabled={busy} className={`${actionClass} text-[var(--app-danger)]`} onClick={removeTeam}>{team.name} 팀 삭제</button>}</div>
    </form>
    {team && <div className="space-y-3">
      <h4 className="text-sm font-bold">팀원 {team.members.length}명</h4>
      {team.members.length > 0 && <ul className="flex flex-wrap gap-2">{team.members.map(member => <li key={member.studentId} className="tp-file">
        <span className="min-w-0 truncate">{member.name}{member.generation ? ` ${member.generation}기` : ''} · {member.studentId}</span>
        <button type="button" className="tp-text-button" disabled={busy} aria-label={`${member.name} 팀에서 빼기`} onClick={async () => { if (member.studentId && await confirmDialog({ title: '팀원 빼기', message: `${member.name} 님을 ${team.name}에서 뺄까요?`, confirmText: '빼기', tone: 'danger' })) await act(() => removeTeamMember(program.id, team.id, member.studentId!), `${member.name} 님을 뺐습니다.`) }}>빼기</button>
      </li>)}</ul>}
      <MemberPicker team={team} program={program} busy={busy} act={act} />
    </div>}
  </article>
}

function BoardSubmission({ programId, team, milestone }: { programId: number; team: BoardTeam; milestone: Milestone }) {
  const submissions = useQuery({ queryKey: ['team-projects', 'submissions', programId, team.id], queryFn: () => listTeamSubmissions(programId, team.id) })
  const submission = submissions.data?.find(item => item.milestoneId === milestone.id)
  return <article className="tp-card space-y-3" aria-label={`${team.name} ${milestone.title} 제출 내용`} aria-live="polite">
    <h4 className="font-bold">{team.name} · {milestone.title}</h4>
    {submissions.isPending && <p role="status" className="text-sm">불러오는 중…</p>}
    {submissions.isError && <p role="alert" className="text-sm text-[var(--app-danger)]">제출 내용을 불러오지 못했습니다.</p>}
    {submissions.data && (submission ? <SubmissionView submission={submission} /> : <p className="text-sm text-[var(--app-muted)]">아직 제출하지 않았습니다.</p>)}
  </article>
}

function Board({ programId }: { programId: number }) {
  const board = useQuery({ queryKey: ['team-projects', 'board', programId], queryFn: () => getTeamProjectBoard(programId) })
  const [selected, setSelected] = useState<{ teamId: number; milestoneId: number } | null>(null)
  const data = board.data
  const team = data?.teams.find(item => item.id === selected?.teamId)
  const milestone = data?.milestones.find(item => item.id === selected?.milestoneId)
  const totals = data ? data.milestones.map(column => data.teams.reduce((sum, row) => sum + (row.cells.find(cell => cell.milestoneId === column.id)?.status === 'MISSING' ? 0 : 1), 0)) : []
  return <section aria-labelledby="tp-admin-board" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="tp-admin-board" className="text-lg font-bold">제출 현황</h3><button type="button" className={actionClass} onClick={() => board.refetch()}>새로고침</button></div>
    {board.isPending && <p role="status">불러오는 중…</p>}
    {board.isError && <p role="alert" className="text-sm text-[var(--app-danger)]">제출 현황을 불러오지 못했습니다.</p>}
    {data && (data.milestones.length === 0 || data.teams.length === 0
      ? <p className="text-sm text-[var(--app-muted)]">제출을 받는 일정과 팀이 있어야 현황이 표시됩니다.</p>
      : <div role="region" aria-label="팀별 제출 현황" tabIndex={0} className="tp-board"><table>
        <caption className="mb-2 text-left text-sm text-[var(--app-muted)]">칸을 누르면 제출 내용을 열어 봅니다.</caption>
        <thead><tr><th scope="col">팀</th>{data.milestones.map((column, index) => <th key={column.id} scope="col">{column.title}<br /><small className="font-normal text-[var(--app-muted)]">{[column.dueAt ? formatWhen(column.dueAt, column.allDay) : '', `${totals[index]}/${data.teams.length}팀`].filter(Boolean).join(' · ')}</small></th>)}</tr></thead>
        <tbody>{data.teams.map(row => <tr key={row.id}>
          <th scope="row">{row.name}<br /><small className="font-normal text-[var(--app-muted)]">{row.memberCount}명</small></th>
          {data.milestones.map(column => {
            const cell = row.cells.find(item => item.milestoneId === column.id)
            const pressed = selected?.teamId === row.id && selected.milestoneId === column.id
            return <td key={column.id}><button type="button" className="tp-cell" aria-pressed={pressed} aria-label={`${row.name} ${column.title} ${STATUS_LABEL[cell?.status ?? 'MISSING']}${cell?.editedAfterDue ? ' 마감 후 수정' : ''}`} onClick={() => setSelected(pressed ? null : { teamId: row.id, milestoneId: column.id })}><StatusChip status={cell?.status ?? 'MISSING'} />{cell?.editedAfterDue && <small className="tp-edited">마감 후 수정</small>}</button></td>
          })}
        </tr>)}</tbody></table></div>)}
    {team && milestone && <BoardSubmission key={`${team.id}:${milestone.id}`} programId={programId} team={team} milestone={milestone} />}
  </section>
}

export default function AdminTeamProjects() {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('program'))
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const programs = useQuery({ queryKey: ['team-projects', 'list'], queryFn: listTeamProjects })
  const programId = programs.data?.some(item => item.id === requested) ? requested : programs.data?.[0]?.id ?? 0
  const detail = useQuery({ queryKey: ['team-projects', 'detail', programId], queryFn: () => getTeamProject(programId), enabled: programId > 0 })
  const program = detail.data
  const select = (id: number) => { setParams(previous => { previous.set('program', String(id)); return previous }); setMessage(''); setError('') }
  const act: Act = async (work, success, onError) => {
    if (pending) return false
    setPending(true); setError(''); setMessage('')
    try {
      await work()
      await client.invalidateQueries({ queryKey: ['team-projects'] })
      setMessage(success)
      return true
    } catch (cause) { (onError ?? setError)(errorText(cause)); return false } finally { setPending(false) }
  }
  const removeProgram = async () => {
    if (program && await confirmDialog({ title: '팀프 삭제', message: `${program.title}을(를) 삭제할까요? 일정, 팀, 제출 내용과 올라온 파일이 모두 삭제되며 복구할 수 없습니다.`, confirmText: '삭제', tone: 'danger' })) await act(() => deleteTeamProject(program.id), '팀프를 삭제했습니다.')
  }
  if (programs.isPending) return <p role="status">팀프 목록을 불러오는 중…</p>
  if (programs.isError) return <div role="alert">팀프 목록을 불러오지 못했습니다. <button className={actionClass} onClick={() => programs.refetch()}>다시 불러오기</button></div>
  return <section className="space-y-6" aria-label="팀 프로젝트 관리">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">팀 프로젝트 관리</h2><p className="mt-2 text-sm text-[var(--app-muted)]">일정, 팀과 팀원, 제출 현황을 관리합니다.</p></div><Link to="/admin?tab=club-forms&category=TEAM_PROJECT" className="tp-text-button">팀프 수요조사 양식</Link>
      {program && <Link to={`/team-projects/${program.id}`} className={actionClass}>회원용 페이지</Link>}</div>
    <div className="flex flex-wrap items-end gap-3">
      {programs.data.length > 0 && <label className="text-sm font-semibold">관리할 팀프<select aria-label="관리할 팀프" className="tp-input mt-2" value={programId} onChange={event => select(Number(event.target.value))}>{programs.data.map(item => <option key={item.id} value={item.id}>{item.title}{item.open ? '' : ' · 마감'}</option>)}</select></label>}
      <button type="button" className={actionClass} onClick={() => setCreating(value => !value)}>{creating ? '작성 닫기' : '새 팀프 만들기'}</button>
    </div>
    {creating && <ProgramForm busy={pending} save={async (draft, onError) => {
      if (pending) return false
      setPending(true); setError(''); setMessage('')
      try { const created = await createTeamProject(draft); await client.invalidateQueries({ queryKey: ['team-projects'] }); select(created.id); setCreating(false); setMessage('팀프를 만들었습니다.'); return true }
      catch (cause) { onError(errorText(cause)); return false } finally { setPending(false) }
    }} />}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
    {programs.data.length === 0 && !creating && <p className="tp-card text-sm">아직 팀프가 없습니다. 새 팀프를 만들어 일정과 팀을 등록하세요.</p>}
    {detail.isPending && programId > 0 && <p role="status">불러오는 중…</p>}
    {detail.isError && <p role="alert">팀프를 불러오지 못했습니다. <button className={actionClass} onClick={() => detail.refetch()}>다시 불러오기</button></p>}
    {program && <div key={program.id} className="space-y-8">
      <ProgramForm program={program} busy={pending} save={(draft, onError) => act(() => updateTeamProject(program.id, draft), '프로그램 정보를 저장했습니다.', onError)} />
      <Milestones program={program} act={act} busy={pending} />
      <section aria-labelledby="tp-admin-teams" className="space-y-4"><h3 id="tp-admin-teams" className="text-lg font-bold">팀과 팀원 · {program.teams.length}팀</h3>
        <p className="text-sm text-[var(--app-muted)]">팀원은 동아리 회원 중에서 고릅니다. 한 회원은 한 프로그램에서 한 팀에만 속할 수 있습니다.</p>
        {program.teams.map(team => <TeamEditor key={team.id} program={program} team={team} busy={pending} act={act} />)}
        <TeamEditor program={program} busy={pending} act={act} />
      </section>
      <Board programId={program.id} />
      <div className="border-t border-[var(--app-hairline)] pt-4"><button type="button" disabled={pending} className={`${actionClass} text-[var(--app-danger)]`} onClick={removeProgram}>이 팀프 삭제</button></div>
    </div>}
  </section>
}
