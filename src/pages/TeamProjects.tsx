import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import PageHeading from '../components/PageHeading'
import { confirmDialog } from '../components/common/ConfirmDialog'
import { showToast } from '../components/common/Toast'
import { useAuth } from '../contexts/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { SubmissionEditor, SubmissionView, StatusChip } from '../features/teamProjects/SubmissionParts'
import {
  milestoneDday, milestonePhase, milestoneWhen, nextMilestone, submissionStatus, uploadErrorText,
} from '../features/teamProjects/teamProjects'
import {
  deleteSubmission, getTeamProject, listTeamProjects, listTeamSubmissions, saveSubmission,
  type Milestone, type Submission, type SubmissionDraft, type Team, type TeamProjectDetail,
} from '../services/teamProjectApi'
import '../styles/site-pages.css'
import '../styles/team-projects.css'

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

function NextDeadline({ milestones, now }: { milestones: Milestone[]; now: Date }) {
  const next = nextMilestone(milestones, now)
  if (!next) return <p role="status" className="tp-card text-sm font-semibold">남은 일정이 없습니다. 모든 일정이 끝났어요.</p>
  const dday = milestoneDday(next, now)
  return <section aria-label="다음 일정" className="tp-card flex flex-wrap items-center justify-between gap-4" data-mine>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-[var(--app-accent-text)]">{dday === 'D-DAY' ? '오늘 일정' : '다음 일정'}</p>
      <h2 className="mt-1 break-words text-xl font-bold">{next.title}</h2>
      <p className="mt-1 text-sm text-[var(--app-muted)]">{next.submittable ? '마감 ' : ''}{milestoneWhen(next)}</p>
    </div>
    {dday && <strong className="tp-dday text-3xl"><span aria-hidden="true">{dday}</span><span className="sr-only">디데이 {dday}</span></strong>}
  </section>
}

function Timeline({ milestones, now, submissions }: { milestones: Milestone[]; now: Date; submissions: Submission[] | undefined }) {
  const next = nextMilestone(milestones, now)
  return <ol className="tp-timeline" aria-label="일정">
    {milestones.map(milestone => {
      const phase = milestonePhase(milestone, now)
      const dday = milestoneDday(milestone, now)
      const mine = submissions?.find(item => item.milestoneId === milestone.id)
      return <li key={milestone.id} className="tp-milestone" data-phase={phase} data-next={next?.id === milestone.id || undefined}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 break-words text-base font-bold">{milestone.title}</h3>
          {dday && <span className="tp-dday">{dday}</span>}
        </div>
        <p className="text-sm text-[var(--app-muted)]">{milestone.submittable ? '마감 ' : ''}{milestoneWhen(milestone)}</p>
        {milestone.description && <p className="whitespace-pre-wrap break-words text-sm leading-6">{milestone.description}</p>}
        <div className="flex flex-wrap gap-2">
          {phase === 'active' && <span className="tp-chip" data-tone="accent">진행 중</span>}
          {next?.id === milestone.id && <span className="tp-chip" data-tone="accent">{dday === 'D-DAY' ? '오늘' : '다음'}</span>}
          {milestone.submittable && submissions && <StatusChip status={submissionStatus(mine, milestone, now)} />}
          {milestone.submittable && !submissions && <span className="tp-chip">제출 받음</span>}
          {!milestone.submittable && <span className="tp-chip">제출 없음</span>}
        </div>
      </li>
    })}
  </ol>
}

function MilestoneSubmission({ program, team, milestone, submission, now }: { program: TeamProjectDetail; team: Team; milestone: Milestone; submission?: Submission; now: Date }) {
  const client = useQueryClient()
  const [editing, setEditing] = useState(!submission)
  const [progress, setProgress] = useState<number | null>(null)
  const controller = useRef<AbortController | null>(null)
  const save = useMutation({
    mutationFn: (draft: SubmissionDraft) => {
      controller.current = new AbortController()
      setProgress(0)
      return saveSubmission(program.id, team.id, milestone.id, draft, { onProgress: setProgress, signal: controller.current.signal }).finally(() => setProgress(null))
    },
    onSuccess: () => { showToast('제출을 저장했습니다.'); setEditing(false) },
    // 성공·실패·취소·시간 초과 어느 쪽이든 서버에 실제로 저장된 상태를 다시 읽는다. 그래야 다시 저장해도 같은 파일이 중복으로 올라가지 않는다.
    onSettled: () => client.invalidateQueries({ queryKey: ['team-projects', 'submissions', program.id, team.id] }),
  })
  const remove = useMutation({
    mutationFn: () => deleteSubmission(program.id, team.id, milestone.id),
    onSuccess: () => { showToast('제출을 삭제했습니다.'); setEditing(true) },
    onSettled: () => client.invalidateQueries({ queryKey: ['team-projects', 'submissions', program.id, team.id] }),
  })
  const error = save.error ?? remove.error
  const canEdit = program.open
  return <article className="tp-card space-y-4" aria-label={`${milestone.title} 제출`}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="min-w-0 break-words text-lg font-bold">{milestone.title}</h3>
      <StatusChip status={submissionStatus(submission, milestone, now)} />
    </header>
    <p className="text-sm text-[var(--app-muted)]">{milestone.dueAt ? `마감 ${milestoneWhen(milestone)} · 마감 후에도 제출할 수 있지만 늦은 제출로 표시됩니다.` : '마감 시각이 정해지지 않았습니다.'}</p>
    {!canEdit && <p role="status" className="text-sm font-semibold">이 프로그램은 마감되어 제출을 고칠 수 없습니다.</p>}
    {submission && !editing && <>
      <SubmissionView submission={submission} />
      {canEdit && <button type="button" className="apple-action-secondary min-h-11 px-4 text-sm" onClick={() => setEditing(true)}>수정하기</button>}
    </>}
    {!submission && !canEdit && <p className="text-sm text-[var(--app-muted)]">제출한 내용이 없습니다.</p>}
    {canEdit && editing && <SubmissionEditor key={`${submission?.id ?? 'new'}-${submission?.updatedAt ?? ''}`} title={milestone.title} submission={submission} busy={save.isPending || remove.isPending} progress={progress} limits={program}
      onCancelUpload={() => controller.current?.abort()}
      onSave={async draft => { try { await save.mutateAsync(draft); return true } catch { return false } }}
      onDelete={submission ? async () => { if (await confirmDialog({ title: '제출 삭제', message: `${milestone.title} 제출을 삭제할까요? 올린 파일도 함께 삭제됩니다.`, confirmText: '삭제', tone: 'danger' })) remove.mutate() } : undefined} />}
    {canEdit && editing && submission && <button type="button" className="tp-text-button" onClick={() => setEditing(false)}>수정 취소</button>}
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{uploadErrorText(error, program)}</p>}
  </article>
}

function TeamCard({ team, mine, admin }: { team: Team; mine: boolean; admin: boolean }) {
  return <li className="tp-card" data-mine={mine || undefined}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words text-lg font-bold">{team.name}</h3>{mine && <span className="tp-chip" data-tone="accent">내 팀</span>}</div>
    {team.topic && <p className="mt-1 break-words text-sm font-semibold text-[var(--app-accent-text)]">{team.topic}</p>}
    {team.intro && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--app-muted)]">{team.intro}</p>}
    <p className="mt-3 break-words text-sm">{team.members.length ? team.members.map(member => `${member.name}${member.generation ? ` (${member.generation}기)` : ''}`).join(', ') : '팀원 미정'}</p>
    {admin && <p className="mt-2 text-xs text-[var(--app-muted)]">제출 내용은 관리 화면의 제출 현황에서 볼 수 있습니다.</p>}
  </li>
}

function ProgramPage({ id }: { id: number }) {
  const { user } = useAuth()
  const now = useNow()
  const detail = useQuery({ queryKey: ['team-projects', 'detail', id], queryFn: () => getTeamProject(id), retry: 1 })
  const program = detail.data
  const myTeam = program?.teams.find(team => team.id === program.myTeamId)
  const submissions = useQuery({
    queryKey: ['team-projects', 'submissions', id, program?.myTeamId],
    queryFn: () => listTeamSubmissions(id, program!.myTeamId!),
    enabled: Boolean(program?.myTeamId),
  })
  useDocumentTitle(program?.title)
  const submittable = program?.milestones.filter(milestone => milestone.submittable) ?? []
  return <div className="site-page"><main className="site-page-inner tp-page">
    <PageHeading>{program?.title ?? '팀 프로젝트'}</PageHeading>
    {detail.isPending && <p role="status" className="mt-6">불러오는 중…</p>}
    {detail.isError && <div role="alert" className="tp-card mt-6"><p>팀 프로젝트를 찾을 수 없습니다.</p><Link to="/team-projects" className="mt-3 inline-block underline">목록으로 돌아가기</Link></div>}
    {program && <div className="mt-6 space-y-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><span className="tp-chip" data-tone={program.open ? 'accent' : undefined}>{program.open ? '진행 중' : '마감'}</span>
          {user?.role === 'ADMIN' && <Link to={`/admin?tab=team-projects&program=${program.id}`} className="tp-text-button">관리 화면</Link>}</div>
        {program.description && <p className="max-w-2xl whitespace-pre-wrap break-words text-base leading-7 text-[var(--app-muted)]">{program.description}</p>}
      </div>
      <Link to="/forms?category=TEAM_PROJECT" className="tp-text-button">팀 프로젝트 신청·수요조사</Link>
      <NextDeadline milestones={program.milestones} now={now} />
      <section aria-labelledby="tp-schedule" className="space-y-4"><h2 id="tp-schedule" className="text-xl font-bold">일정</h2>
        {program.milestones.length ? <Timeline milestones={program.milestones} now={now} submissions={program.myTeamId ? submissions.data : undefined} /> : <p className="tp-card text-sm">아직 등록된 일정이 없습니다.</p>}
      </section>
      <section aria-labelledby="tp-mine" className="space-y-4"><h2 id="tp-mine" className="text-xl font-bold">{myTeam ? `내 팀 · ${myTeam.name}` : '내 팀 제출'}</h2>
        {!myTeam && (user?.role === 'ADMIN'
          ? <p className="tp-card text-sm leading-6">회장 계정은 팀에 속해 있지 않습니다. 팀별 제출은 <Link to={`/admin?tab=team-projects&program=${program.id}`} className="font-semibold text-[var(--app-accent-text)] underline">관리 화면의 제출 현황</Link>에서 확인하세요.</p>
          : <p className="tp-card text-sm leading-6">아직 배정된 팀이 없습니다. 팀 배정은 운영진이 합니다.</p>)}
        {myTeam && submissions.isPending && <p role="status">제출 내용을 불러오는 중…</p>}
        {myTeam && submissions.isError && <p role="alert" className="text-sm">제출 내용을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => submissions.refetch()}>다시 불러오기</button></p>}
        {myTeam && submissions.data && (submittable.length
          ? <div className="space-y-4">{submittable.map(milestone => <MilestoneSubmission key={milestone.id} now={now} program={program} team={myTeam} milestone={milestone} submission={submissions.data.find(item => item.milestoneId === milestone.id)} />)}</div>
          : <p className="tp-card text-sm">제출을 받는 일정이 아직 없습니다.</p>)}
      </section>
      <section aria-labelledby="tp-teams" className="space-y-4"><h2 id="tp-teams" className="text-xl font-bold">참가 팀 {program.teams.length}팀</h2>
        {program.teams.length ? <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">{program.teams.map(team => <TeamCard key={team.id} team={team} mine={team.id === program.myTeamId} admin={user?.role === 'ADMIN'} />)}</ul> : <p className="tp-card text-sm">아직 구성된 팀이 없습니다.</p>}
      </section>
    </div>}
  </main></div>
}

function ProgramList() {
  const programs = useQuery({ queryKey: ['team-projects', 'list'], queryFn: listTeamProjects, retry: 1 })
  return <div className="site-page"><main className="site-page-inner tp-page">
    <PageHeading>팀 프로젝트</PageHeading>
    <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--app-muted)]">팀별 일정과 제출 현황을 확인하고, 내 팀의 결과물을 제출하세요.</p>
    <Link to="/forms?category=TEAM_PROJECT" className="tp-text-button mt-4">팀 프로젝트 신청·수요조사</Link>
    {programs.isPending && <p role="status" className="mt-6">불러오는 중…</p>}
    {programs.isError && <p role="alert" className="mt-6 text-sm">목록을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => programs.refetch()}>다시 불러오기</button></p>}
    {programs.data?.length === 0 && <p className="tp-card mt-6">진행 중인 팀 프로젝트가 아직 없습니다.</p>}
    <ul className="mt-6 grid list-none gap-4 p-0">{programs.data?.map(program => <li key={program.id}>
      <Link to={`/team-projects/${program.id}`} className="tp-card block" data-mine={program.myTeamId ? true : undefined}>
        <div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 break-words text-xl font-bold">{program.title}</h2><span className="tp-chip" data-tone={program.open ? 'accent' : undefined}>{program.open ? '진행 중' : '마감'}</span>{program.myTeamName && <span className="tp-chip">내 팀 · {program.myTeamName}</span>}</div>
        {program.description && <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-[var(--app-muted)]">{program.description}</p>}
      </Link>
    </li>)}</ul>
  </main></div>
}

export default function TeamProjects() {
  const { programId } = useParams()
  if (programId === undefined) return <ProgramList />
  const id = /^[1-9]\d*$/.test(programId) ? Number(programId) : 0
  return Number.isSafeInteger(id) && id > 0 ? <ProgramPage key={id} id={id} /> : <ProgramPage key="invalid" id={0} />
}
