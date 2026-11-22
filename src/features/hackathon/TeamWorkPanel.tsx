import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getHackathonTeamWork, saveHackathonTeamWork, type HackathonProject } from '../../services/hackathonApi'
import WorkFields from './WorkFields'
import { workDraft } from './workDraft'

function TeamWorkEditor({ eventId, project, editable, saved }: {
  eventId: number; project: HackathonProject; editable: boolean; saved: (project: HackathonProject) => void
}) {
  const [draft, setDraft] = useState(() => workDraft(project))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const changedOnServer = draft.version !== project.version

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setNotice('')
    try {
      const value = await saveHackathonTeamWork(eventId, project.projectId, draft)
      setDraft(workDraft(value))
      saved(value)
      setNotice(value.published ? '공개 페이지에 반영했습니다.' : '팀 초안을 저장했습니다.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '작품을 저장하지 못했습니다.')
    } finally {
      setPending(false)
    }
  }

  return <details className="rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] p-4">
    <summary className="cursor-pointer font-semibold">{project.teamName || project.title} · {project.published ? '공개 작품' : '팀 초안'}</summary>
    <form onSubmit={submit} className="mt-4 grid gap-4">
      <fieldset disabled={!editable || pending} className="grid min-w-0 gap-4">
        <legend className="mb-2 text-sm text-[var(--app-muted)]">{editable
          ? project.published ? '저장하면 공개 작품에 바로 반영됩니다.' : '팀원과 운영진이 초안을 확인할 수 있습니다. 운영진이 공개하면 작품 목록에 나타납니다.'
          : '평가가 열렸거나 제출된 평가가 있어 작품 편집이 잠겼습니다.'}</legend>
        <WorkFields value={draft} onChange={setDraft} required={project.published} />
      </fieldset>
      {changedOnServer && <p role="alert" className="flex flex-wrap items-center gap-2 text-sm">
        작품이 변경되었습니다. 필요한 내용은 복사해 둔 뒤 최신 글을 불러오세요.
        <button type="button" className="underline" onClick={() => setDraft(workDraft(project))}>최신 글 불러오기</button>
      </p>}
      {editable && <button type="submit" disabled={pending || changedOnServer} className="apple-action-primary min-h-11 justify-self-start px-4 text-sm disabled:opacity-50">{pending ? '저장 중…' : '작품 저장'}</button>}
      {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </form>
  </details>
}

export default function TeamWorkPanel({ eventId, studentId }: { eventId: number; studentId: string }) {
  const client = useQueryClient()
  const key = ['hackathon', 'team-work', eventId, studentId]
  const work = useQuery({ queryKey: key, queryFn: () => getHackathonTeamWork(eventId), retry: 1 })
  if (work.isError) return <p role="alert" className="mt-5 text-sm">팀 작품을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => void work.refetch()}>다시 불러오기</button></p>
  if (!work.data?.projects.length) return null

  return <section className="hackathon-intro mt-6 space-y-3" aria-labelledby="hackathon-my-work">
    <h2 id="hackathon-my-work" className="text-lg font-bold">내 팀 작품</h2>
    {work.data.projects.map(project => <TeamWorkEditor key={project.projectId} project={project} eventId={eventId} editable={work.data.editable} saved={value => {
      client.setQueryData<typeof work.data>(key, current => current && { ...current, projects: current.projects.map(item => item.projectId === value.projectId ? value : item) })
      void client.invalidateQueries({ queryKey: ['hackathon', 'event', eventId] })
      void client.invalidateQueries({ queryKey: ['admin', 'hackathon', 'event', eventId] })
    }} />)}
  </section>
}
