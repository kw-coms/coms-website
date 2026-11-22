import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listMembers } from '../../services/adminApi'
import { getHackathonProjectMembers, type HackathonProject, type HackathonProjectWrite } from '../../services/hackathonApi'
import WorkFields from '../../features/hackathon/WorkFields'
import { workDraft } from '../../features/hackathon/workDraft'

type Person = { id: number; name: string; studentId: string }
const input = 'hackathon-input mt-2'

function ProjectForm({ project, initialMembers, busy, guarded, save }: {
  project?: HackathonProject; initialMembers: number[]; busy: boolean; guarded: boolean
  save: (payload: HackathonProjectWrite) => Promise<boolean>
}) {
  const [work, setWork] = useState(() => workDraft(project))
  const [teamName, setTeamName] = useState(project?.teamName ?? '')
  const [published, setPublished] = useState(project?.published ?? Boolean(project))
  const [position, setPosition] = useState(project?.position)
  const [memberIds, setMemberIds] = useState(initialMembers)
  const [search, setSearch] = useState('')
  const people = useQuery({ queryKey: ['admin', 'hackathon', 'member-directory'], queryFn: async () => await listMembers() as Person[], enabled: Boolean(search.trim() || memberIds.length) })
  const results = search.trim() ? (people.data ?? []).filter(person => !memberIds.includes(person.id) && (person.name + ' ' + person.studentId).includes(search.trim())).slice(0, 10) : []
  const changedOnServer = work.version !== project?.version
  const ready = (published || Boolean(teamName.trim())) && (!published || [work.title, work.author, work.description].every(value => value.trim()))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!await save({ ...work, teamName, published, position, memberIds })) return
    if (!project) {
      setWork(workDraft()); setTeamName(''); setPublished(false); setPosition(undefined); setMemberIds([]); setSearch('')
    }
  }

  return <form onSubmit={submit} aria-label={project ? (project.teamName || project.title) + ' 팀 편집' : '새 팀 등록'} className="grid gap-4">
    <label className="text-sm font-semibold">팀 이름<input required={!published || !project} maxLength={120} className={input} value={teamName} onChange={e => setTeamName(e.target.value)} /></label>
    <div className="grid gap-2 rounded-lg border border-[var(--app-hairline)] p-3">
      <label className="text-sm font-semibold">작성할 팀원 검색<input className={input} value={search} onChange={e => setSearch(e.target.value)} placeholder="회원 이름 또는 학번" autoComplete="off" /></label>
      <p className="text-xs text-[var(--app-muted)]">선택한 사이트 계정은 로그인 후 이 팀의 작품을 작성할 수 있습니다.</p>
      {people.isError && <p role="alert" className="text-sm">회원 목록을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => void people.refetch()}>다시 시도</button></p>}
      {people.isFetching && <p role="status" className="text-sm">회원 검색 중…</p>}
      {search.trim() && people.isSuccess && results.length === 0 && <p className="text-sm">추가할 회원이 없습니다.</p>}
      <ul className="grid gap-1">{results.map(person => <li key={person.id}><button type="button" disabled={memberIds.length >= 30} className="apple-action-secondary min-h-9 px-3 text-sm" onClick={() => { setMemberIds([...memberIds, person.id]); setSearch('') }}>{person.name} ({person.studentId}) 추가</button></li>)}</ul>
      {memberIds.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="작성 권한이 있는 팀원">{memberIds.map(id => {
        const member = people.data?.find(person => person.id === id)
        const label = member ? member.name + ' (' + member.studentId + ')' : '회원 #' + id
        return <li key={id}><button type="button" className="apple-action-secondary min-h-9 px-3 text-sm" aria-label={label + ' 제외'} onClick={() => setMemberIds(memberIds.filter(value => value !== id))}>{label} ×</button></li>
      })}</ul>}
    </div>
    <WorkFields value={work} onChange={setWork} required={published} />
    {project && <label className="text-sm font-semibold">표시 순서<input type="number" min="0" max="9999" className={input} value={position ?? 0} onChange={e => setPosition(Number(e.target.value))} /></label>}
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={published} disabled={guarded} onChange={e => setPublished(e.target.checked)} /> 작품 공개</label>
    <button disabled={busy || !ready || changedOnServer} className="apple-action-primary min-h-11 justify-self-start px-5 text-sm disabled:opacity-50">{project ? '팀·작품 저장' : '팀 추가'}</button>
    {changedOnServer && <p role="alert" className="text-sm">다른 사람이 작품을 저장했습니다. 필요한 내용을 복사한 뒤 편집을 다시 열어 주세요.</p>}
  </form>
}

export default function HackathonProjectEditor({ eventId, project, busy, guarded, save }: {
  eventId: number; project?: HackathonProject; busy: boolean; guarded: boolean
  save: (payload: HackathonProjectWrite) => Promise<boolean>
}) {
  const client = useQueryClient()
  const key = ['admin', 'hackathon', 'project-members', eventId, project?.projectId]
  const roster = useQuery({ queryKey: key, queryFn: () => getHackathonProjectMembers(eventId, project!.projectId), enabled: Boolean(project), staleTime: 0 })
  if (project && (roster.isPending || roster.isFetching && !roster.data)) return <p role="status">팀원을 불러오는 중…</p>
  if (project && roster.isError) return <p role="alert">팀원을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => void roster.refetch()}>다시 시도</button></p>
  return <ProjectForm project={project} initialMembers={roster.data ?? []} busy={busy} guarded={guarded} save={async payload => {
    const ok = await save(payload)
    if (ok && project) client.setQueryData(key, payload.memberIds)
    return ok
  }} />
}
